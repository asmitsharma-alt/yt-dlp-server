import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormatInfo {
  format_id: string;
  ext: string;
  quality: string;
  filesize: number | null;
  vcodec: string;
  acodec: string;
  audioOnly: boolean;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  formats: FormatInfo[];
}

export interface DownloadResult {
  process: ChildProcess;
  isAudioOnly: boolean;
  tempFilePath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps common yt-dlp stderr messages to user-friendly error descriptions.
 * Returns { message, isClientError, raw } so callers can set HTTP status.
 */
function parseStderrError(stderr: string): { message: string; isClientError: boolean; raw: string } {
  const lower = stderr.toLowerCase();

  if (lower.includes('private video')) {
    return { message: 'This video is private and cannot be accessed.', isClientError: true, raw: stderr };
  }
  if (lower.includes('sign in to confirm your age') || lower.includes('age-restricted')) {
    return { message: 'This video is age-restricted and cannot be downloaded.', isClientError: true, raw: stderr };
  }
  if (lower.includes('video unavailable') || lower.includes('is not available')) {
    return { message: 'This video is unavailable. It may have been removed or region-locked.', isClientError: true, raw: stderr };
  }
  if (lower.includes('copyright')) {
    return { message: 'This video is unavailable due to a copyright claim.', isClientError: true, raw: stderr };
  }
  if (lower.includes('live event')) {
    return { message: 'Live streams cannot be downloaded while they are in progress.', isClientError: true, raw: stderr };
  }
  if (lower.includes('urlopen error') || lower.includes('unable to download webpage')) {
    return { message: 'Unable to reach YouTube. Please check your network connection.', isClientError: false, raw: stderr };
  }

  return {
    message: 'Failed to retrieve video information. Please try again later.',
    isClientError: false,
    raw: stderr,
  };
}

// ---------------------------------------------------------------------------
// getVideoInfo
// ---------------------------------------------------------------------------

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  try {
    const { stdout } = await execFileAsync(
      'yt-dlp',
      ['-j', '--no-playlist', url],
      { timeout: 60_000 },
    );

    const data = JSON.parse(stdout);

    // ---- Build format list ---------------------------------------------------
    const rawFormats: unknown[] = Array.isArray(data.formats) ? data.formats : [];

    const mapped: FormatInfo[] = [];

    for (const f of rawFormats) {
      const fmt = f as Record<string, unknown>;

      const vcodec = (fmt.vcodec as string) || 'none';
      const acodec = (fmt.acodec as string) || 'none';

      const hasVideo = vcodec !== 'none';
      const hasAudio = acodec !== 'none';

      // Keep combined (video+audio) or audio-only formats
      const isCombined = hasVideo && hasAudio;
      const isAudioOnly = !hasVideo && hasAudio;

      if (!isCombined && !isAudioOnly) continue;

      const quality =
        (fmt.format_note as string) ||
        (fmt.resolution as string) ||
        (fmt.format_id as string) ||
        'unknown';

      mapped.push({
        format_id: String(fmt.format_id ?? ''),
        ext: String(fmt.ext ?? 'mp4'),
        quality,
        filesize: (fmt.filesize as number) ?? (fmt.filesize_approx as number) ?? null,
        vcodec,
        acodec,
        audioOnly: isAudioOnly,
      });
    }

    // ---- Deduplicate by quality label, keep best (largest filesize) per tier --
    const bestByQuality = new Map<string, FormatInfo>();

    for (const fmt of mapped) {
      const key = `${fmt.audioOnly ? 'audio' : 'video'}_${fmt.quality}`;
      const existing = bestByQuality.get(key);

      if (
        !existing ||
        (fmt.filesize ?? 0) > (existing.filesize ?? 0)
      ) {
        bestByQuality.set(key, fmt);
      }
    }

    const formats = Array.from(bestByQuality.values());

    return {
      title: String(data.title ?? 'Untitled'),
      thumbnail: String(data.thumbnail ?? ''),
      duration: Number(data.duration ?? 0),
      uploader: String(data.uploader ?? data.channel ?? 'Unknown'),
      formats,
    };
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };

    if (error.stderr) {
      console.error('[yt-dlp stderr]', error.stderr);
      const parsed = parseStderrError(error.stderr);
      const wrapped = new Error(parsed.message) as Error & { isClientError: boolean; raw: string };
      wrapped.isClientError = parsed.isClientError;
      wrapped.raw = parsed.raw;
      throw wrapped;
    }

    console.error('[yt-dlp error]', error.message);
    throw new Error(
      error.message || 'An unexpected error occurred while fetching video info.',
    );
  }
}

// ---------------------------------------------------------------------------
// spawnDownload
// ---------------------------------------------------------------------------

export function spawnDownload(
  url: string,
  formatId: string,
  isAudioOnly: boolean,
): DownloadResult {
  if (isAudioOnly) {
    // Audio downloads need post-processing (MP3 conversion) which requires a
    // temp file because yt-dlp cannot pipe post-processed output to stdout.
    const tempFilePath = path.join(
      os.tmpdir(),
      `ytdl_${crypto.randomBytes(8).toString('hex')}.mp3`,
    );

    const proc = spawn('yt-dlp', [
      '-f', formatId,
      '--extract-audio',
      '--audio-format', 'mp3',
      '-o', tempFilePath,
      '--no-playlist',
      url,
    ]);

    return { process: proc, isAudioOnly: true, tempFilePath };
  }

  // Video: pipe directly to stdout
  const proc = spawn('yt-dlp', [
    '-f', formatId,
    '-o', '-',
    '--no-playlist',
    url,
  ]);

  return { process: proc, isAudioOnly: false };
}
