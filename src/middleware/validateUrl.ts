import type { Request, Response, NextFunction } from 'express';

const YOUTUBE_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)[a-zA-Z0-9_-]+/;

export function validateUrl(req: Request, res: Response, next: NextFunction): void {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({
      error: 'Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link.',
    });
    return;
  }

  if (!YOUTUBE_URL_REGEX.test(url)) {
    res.status(400).json({
      error: 'Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link.',
    });
    return;
  }

  next();
}
