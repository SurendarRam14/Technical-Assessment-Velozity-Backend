import bcrypt from 'bcrypt';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/apiError';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { LoginInput, RegisterInput } from './auth.schema';

export class AuthService {
  static async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw ApiError.conflict('A user with this email address already exists', 'USER_EXISTS');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(input.password, saltRounds);

    const user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        role: input.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  }

  static async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user && email.endsWith('@projectpulse.com')) {
      const fallbackEmail = email.replace('@projectpulse.com', '@velozity.com');
      user = await prisma.user.findUnique({ where: { email: fallbackEmail } });
    } else if (!user && email.endsWith('@velozity.com')) {
      const fallbackEmail = email.replace('@velozity.com', '@projectpulse.com');
      user = await prisma.user.findUnique({ where: { email: fallbackEmail } });
    }

    if (!user) {
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const tokenPayload = { id: user.id, role: user.role };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  static async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      throw ApiError.unauthorized('User not found', 'USER_NOT_FOUND');
    }

    const tokenPayload = { id: user.id, role: user.role };
    const newAccessToken = signAccessToken(tokenPayload);
    const newRefreshToken = signRefreshToken(tokenPayload);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
