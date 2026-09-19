import { Role } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/apiError';
import { CreateProjectInput } from './projects.schema';

export class ProjectsService {
  static async listProjects(user: { id: string; role: Role }) {
    // Service-layer role scoping
    if (user.role === Role.DEVELOPER) {
      throw ApiError.forbidden('Forbidden: Developers cannot list all projects');
    }

    const where: any = {};
    if (user.role === Role.PM) {
      where.pmId = user.id;
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        client: {
          select: { id: true, name: true },
        },
        pm: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return projects;
  }

  static async getProjectById(user: { id: string; role: Role }, projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: {
          select: { id: true, name: true },
        },
        pm: {
          select: { id: true, name: true, email: true },
        },
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Service-layer ownership checks
    if (user.role === Role.PM) {
      if (project.pmId !== user.id) {
        throw ApiError.forbidden('Forbidden: You do not own or have access to this project');
      }
    } else if (user.role === Role.DEVELOPER) {
      // Assigned devs only: must have at least one task assigned in this project
      const assignedTask = project.tasks.find((t) => t.assigneeId === user.id);
      if (!assignedTask) {
        throw ApiError.forbidden('Forbidden: You are not assigned to any tasks in this project');
      }

      // Developer only sees their own assigned tasks
      project.tasks = project.tasks.filter((t) => t.assigneeId === user.id);
    }

    return project;
  }

  static async createProject(user: { id: string; role: Role }, input: CreateProjectInput) {
    // Service-layer role scoping
    if (user.role === Role.DEVELOPER) {
      throw ApiError.forbidden('Forbidden: Developers cannot create projects');
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
    });
    if (!client) {
      throw ApiError.notFound('Client not found');
    }

    let assignedPmId = user.id;

    if (user.role === Role.ADMIN) {
      if (input.pmId) {
        const pmUser = await prisma.user.findUnique({
          where: { id: input.pmId },
        });
        if (!pmUser || (pmUser.role !== Role.PM && pmUser.role !== Role.ADMIN)) {
          throw ApiError.badRequest('Assigned project manager must be a valid PM or Admin');
        }
        assignedPmId = pmUser.id;
      }
    } else if (user.role === Role.PM) {
      // PMs can only create projects owned by themselves
      assignedPmId = user.id;
    }

    const project = await prisma.project.create({
      data: {
        name: input.name.trim(),
        clientId: input.clientId,
        pmId: assignedPmId,
      },
      include: {
        client: {
          select: { id: true, name: true },
        },
        pm: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return project;
  }
}
