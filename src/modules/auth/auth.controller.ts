import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ApiError } from '../../utils/apiError';
import { CookieOptions } from 'express';

const REFRESH_COOKIE_NAME = 'refreshToken';

const getRefreshCookieOptions = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/',
  };
};

export class AuthController {
  static async register(req: Request, res: Response) {
    const user = await AuthService.register(req.body);
    res.status(201).json({
      user,
    });
  }

  static async login(req: Request, res: Response) {
    const { accessToken, refreshToken, user } = await AuthService.login(req.body);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    res.status(200).json({
      accessToken,
      user,
    });
  }

  static async refresh(req: Request, res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!token) {
      throw ApiError.unauthorized('Refresh token is missing', 'REFRESH_TOKEN_MISSING');
    }

    const { accessToken, refreshToken, user } = await AuthService.refresh(token);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

    res.status(200).json({
      accessToken,
      user,
    });
  }

  static async logout(_req: Request, res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });

    res.status(200).json({
      message: 'Logged out successfully',
    });
  }
}
