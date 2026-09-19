import { Role } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/apiError';
import { CreateClientInput } from './clients.schema';

export class ClientsService {
  static async listClients(user: { id: string; role: Role }) {
    // Service-layer role enforcement: Developers cannot view client list
    if (user.role === Role.DEVELOPER) {
      throw ApiError.forbidden('Forbidden: Developers cannot access clients list');
    }

    const clients = await prisma.client.findMany({
      include: {
        _count: {
          select: { projects: true },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return clients;
  }

  static async createClient(user: { id: string; role: Role }, input: CreateClientInput) {
    // Service-layer role enforcement: Only Admins can create clients
    if (user.role !== Role.ADMIN) {
      throw ApiError.forbidden('Forbidden: Only administrators can create clients');
    }

    const client = await prisma.client.create({
      data: {
        name: input.name.trim(),
      },
    });

    return client;
  }
}
