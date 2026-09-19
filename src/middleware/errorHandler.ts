import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/apiError';

export const errorHandler: ErrorRequestHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // If it's our custom ApiError
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // If it's a Zod validation error
  if (err instanceof ZodError || err.name === 'ZodError' || Array.isArray(err?.issues)) {
    const issues = err.issues || err.errors || [];
    const message = issues.map((e: any) => `${(e.path || []).join('.')}: ${e.message}`).join(', ');
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: message || 'Invalid input data',
      },
    });
    return;
  }

  // If it's a JSON parse error (malformed request body)
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload',
      },
    });
    return;
  }

  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'A unique constraint violation occurred',
      },
    });
    return;
  }

  // Log unexpected errors
  console.error('Unhandled Server Error:', err);

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isProduction ? 'An unexpected error occurred' : err.message || 'Internal server error',
    },
  });
};
