import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Role } from '@prisma/client';
import { ApiError } from '../utils/apiError';

export const requireRole = (...roles: Role[]): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required', 'UNAUTHORIZED');
    }

    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden('Forbidden: You do not have permission to access this resource', 'FORBIDDEN');
    }

    next();
  };
};
