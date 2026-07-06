import { Router, type Request, type Response } from 'express';
import { validateUrl } from '../middleware/validateUrl.js';
import { infoLimiter } from '../middleware/rateLimiter.js';
import { getVideoInfo } from '../utils/ytdlp.js';

const router = Router();

router.get('/', infoLimiter, validateUrl, async (req: Request, res: Response) => {
  const url = req.query.url as string;

  try {
    const info = await getVideoInfo(url);
    res.json(info);
  } catch (err: unknown) {
    const error = err as Error & { isClientError?: boolean; raw?: string };
    const message = error.message || 'Failed to fetch video info.';
    const isClientError = error.isClientError === true;

    const body: Record<string, string> = { error: message };
    // Include raw yt-dlp stderr in response for debugging
    if (error.raw) {
      body.detail = error.raw;
    }

    res.status(isClientError ? 400 : 500).json(body);
  }
});

export default router;
