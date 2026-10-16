import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export { AppError };

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode ?? 500;
  const message = err.message ?? 'Internal Server Error';

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${statusCode} — ${message}`);
    if (statusCode === 500) console.error(err.stack);
  }

  // Typed AppError or error containing a specific code
  if (err.code) {
    res.status(statusCode).json({
      success: false,
      code: err.code,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
    return;
  }

  // Keep current behaviour for untyped errors
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
