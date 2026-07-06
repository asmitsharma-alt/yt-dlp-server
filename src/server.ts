import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import infoRouter from './routes/info.js';
import downloadRouter from './routes/download.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

// CORS
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Request logging
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// JSON body parsing
app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/info', infoRouter);
app.use('/api/download', downloadRouter);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message);

  if (NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(500).json({
    error: NODE_ENV === 'production'
      ? 'An internal server error occurred.'
      : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT} (${NODE_ENV})`);
});

export default app;
