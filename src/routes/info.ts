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
    const error = err as Error;
    const message = error.message || 'Failed to fetch video info.';

    // yt-dlp wrapper throws descriptive errors for known issues (private,
    // age-restricted, etc.) — surface those as 400s so the client can
    // distinguish user-fixable problems from server errors.
    const isClientError =
      message.includes('private') ||
      message.includes('age-restricted') ||
      message.includes('unavailable') ||
      message.includes('copyright') ||
      message.includes('Live streams') ||
      message.includes('check the URL');

    res.status(isClientError ? 400 : 500).json({ error: message });
  }
});

export default router;
