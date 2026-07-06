import type { Request, Response, NextFunction } from 'express';

const YOUTUBE_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)[a-zA-Z0-9_-]+/;

/**
 * Cleans a YouTube URL by removing tracking parameters (si, feature, etc.)
 * and any trailing junk (e.g. `:1` appended by browser console copy).
 */
function cleanYouTubeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);

    // Strip tracking / irrelevant query params
    const paramsToRemove = ['si', 'feature', 'pp', 'ab_channel', 'cbrd', 'ucbcb'];
    for (const p of paramsToRemove) {
      parsed.searchParams.delete(p);
    }

    // For youtu.be short links the video ID is the pathname.
    // Remove any trailing colon + digits that may have been accidentally appended
    // (e.g. a browser console line number like `:1`).
    parsed.pathname = parsed.pathname.replace(/:\d+$/, '');

    return parsed.toString();
  } catch {
    // If URL parsing fails, return as-is and let the regex reject it
    return rawUrl;
  }
}

export function validateUrl(req: Request, res: Response, next: NextFunction): void {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({
      error: 'Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link.',
    });
    return;
  }

  // Clean the URL before validation and downstream use
  const cleanedUrl = cleanYouTubeUrl(url);

  if (!YOUTUBE_URL_REGEX.test(cleanedUrl)) {
    res.status(400).json({
      error: 'Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link.',
    });
    return;
  }

  // Replace the query param with the cleaned URL so downstream handlers use it
  req.query.url = cleanedUrl;

  next();
}
