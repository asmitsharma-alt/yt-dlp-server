import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import { validateUrl } from '../middleware/validateUrl.js';
import { downloadLimiter } from '../middleware/rateLimiter.js';
import { spawnDownload } from '../utils/ytdlp.js';
import { sanitizeFilename } from '../utils/sanitize.js';

const router = Router();

const TEN_MINUTES_MS = 10 * 60 * 1000;

router.get('/', downloadLimiter, validateUrl, (req: Request, res: Response) => {
  const url = req.query.url as string;
  const formatId = req.query.format_id as string | undefined;
  const rawFilename = (req.query.filename as string) || 'download';
  const isAudioOnly = req.query.audio === 'true';

  if (!formatId) {
    res.status(400).json({ error: 'Missing required query parameter: format_id' });
    return;
  }

  const safeName = sanitizeFilename(rawFilename);
  const { process: proc, tempFilePath } = spawnDownload(url, formatId, isAudioOnly);

  let headersSent = false;
  let stderrChunks: string[] = [];
  let killed = false;

  // Collect stderr for diagnostics
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString());
  });

  // 10-minute safety timeout
  const timeout = setTimeout(() => {
    if (!killed) {
      killed = true;
      proc.kill('SIGTERM');
      if (!headersSent) {
        res.status(504).json({ error: 'Download timed out. Please try again.' });
      }
    }
  }, TEN_MINUTES_MS);

  // Kill yt-dlp if the client disconnects early
  res.on('close', () => {
    clearTimeout(timeout);
    if (!killed) {
      killed = true;
      proc.kill('SIGTERM');
    }
    // Clean up temp file for audio downloads on client disconnect
    if (tempFilePath) {
      fs.unlink(tempFilePath, () => {});
    }
  });

  if (isAudioOnly && tempFilePath) {
    // ---- Audio download: wait for yt-dlp to finish, then stream temp file ----
    proc.on('close', (code) => {
      clearTimeout(timeout);

      if (killed) return;

      if (code !== 0) {
        const stderr = stderrChunks.join('');
        console.error(`[Download] yt-dlp exited with code ${code}:`, stderr);
        // Clean up temp file on failure
        fs.unlink(tempFilePath, () => {});
        if (!headersSent) {
          res.status(500).json({ error: 'Audio download failed. Please try again.' });
        }
        return;
      }

      // Verify temp file exists before streaming
      if (!fs.existsSync(tempFilePath)) {
        if (!headersSent) {
          res.status(500).json({ error: 'Audio conversion failed. Output file not found.' });
        }
        return;
      }

      headersSent = true;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}.mp3"`,
      );

      const fileStream = fs.createReadStream(tempFilePath);

      fileStream.on('error', (err) => {
        console.error('[Download] Read stream error:', err.message);
        fs.unlink(tempFilePath, () => {});
        if (!res.writableEnded) {
          res.end();
        }
      });

      fileStream.on('end', () => {
        // Delete temp file after successfully streaming
        fs.unlink(tempFilePath, () => {});
      });

      fileStream.pipe(res);
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[Download] Process error:', err.message);
      fs.unlink(tempFilePath, () => {});
      if (!headersSent) {
        res.status(500).json({ error: 'Failed to start download process.' });
      }
    });
  } else {
    // ---- Video download: pipe stdout directly to response --------------------
    headersSent = true;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}.mp4"`,
    );

    proc.stdout?.pipe(res);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !killed) {
        const stderr = stderrChunks.join('');
        console.error(`[Download] yt-dlp exited with code ${code}:`, stderr);
        // Can't send an error response since we already started streaming
        if (!res.writableEnded) {
          res.end();
        }
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[Download] Process error:', err.message);
      if (!res.writableEnded) {
        res.end();
      }
    });
  }
});

export default router;
