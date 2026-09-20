import { Role } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/apiError';

export interface UserFilters {
  role?: Role;
  search?: string;
}

export class UsersService {
  static async listUsers(filters?: UserFilters) {
    const where: any = {};

    if (filters?.role) {
      where.role = filters.role;
    }

    if (filters?.search && filters.search.trim()) {
      const searchTerm = filters.search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return users;
  }
}
