import { Role } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/apiError';

export interface GetActivityQuery {
  projectId?: string;
  since?: string;
  limit?: string;
}

export class ActivityService {
  static async listActivity(user: { id: string; role: Role }, query: GetActivityQuery) {
    const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 20, 100) : 20;
    const where: any = {};

    if (query.projectId) {
      // Validate project access
      const project = await prisma.project.findUnique({
        where: { id: query.projectId },
      });
      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      if (user.role === Role.PM && project.pmId !== user.id) {
        throw ApiError.forbidden('Forbidden: You do not have access to this project');
      }

      if (user.role === Role.DEVELOPER) {
        const hasTask = await prisma.task.findFirst({
          where: { projectId: query.projectId, assigneeId: user.id },
        });
        if (!hasTask) {
          throw ApiError.forbidden('Forbidden: You are not assigned to this project');
        }
      }

      where.projectId = query.projectId;
    } else {
      // Global feed scoped by role
      if (user.role === Role.PM) {
        where.task = {
          project: {
            pmId: user.id,
          },
        };
      } else if (user.role === Role.DEVELOPER) {
        // Dev sees activity for projects they participate in
        const devProjects = await prisma.task.findMany({
          where: { assigneeId: user.id },
          select: { projectId: true },
          distinct: ['projectId'],
        });
        where.projectId = {
          in: devProjects.map((t) => t.projectId),
        };
      }
    }

    if (query.since) {
      const sinceDate = new Date(query.since);
      if (!isNaN(sinceDate.getTime())) {
        where.createdAt = {
          gt: sinceDate,
        };
      }
    }

    const activityLogs = await prisma.activityLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        task: {
          select: { id: true, title: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return activityLogs;
  }
}
