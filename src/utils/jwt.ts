import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { ApiError } from './apiError';

export interface TokenPayload {
  id: string;
  role: Role;
}

const ACCESS_SECRET: jwt.Secret = process.env.ACCESS_TOKEN_SECRET || 'default_access_secret';
const REFRESH_SECRET: jwt.Secret = process.env.REFRESH_TOKEN_SECRET || 'default_refresh_secret';

const ACCESS_TTL = (process.env.ACCESS_TOKEN_TTL || '15m') as unknown as number;
const REFRESH_TTL = (process.env.REFRESH_TOKEN_TTL || '7d') as unknown as number;

export const signAccessToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: ACCESS_TTL,
  };
  return jwt.sign(payload, ACCESS_SECRET, options);
};

export const signRefreshToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: REFRESH_TTL,
  };
  return jwt.sign(payload, REFRESH_SECRET, options);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as TokenPayload;
    return decoded;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token has expired', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as TokenPayload;
    return decoded;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Refresh token has expired', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid refresh token', 'INVALID_TOKEN');
  }
};
