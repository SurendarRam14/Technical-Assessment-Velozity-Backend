import { Role } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/apiError';
import { GetActivityQuery } from './activity.schema';

export class ActivityService {
  static async listActivity(user: { id: string; role: Role }, query: GetActivityQuery) {
    const parsedLimit = query.limit ? parseInt(String(query.limit), 10) : 20;
    const limit = isNaN(parsedLimit) || parsedLimit <= 0 ? 20 : parsedLimit;
    const where: any = {};

    if (query.projectId) {
      // Validate project exists
      const project = await prisma.project.findUnique({
        where: { id: query.projectId },
      });
      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      // Role scoping when projectId is provided:
      // - Admin can query any project
      // - PM only projects they own
      if (user.role === Role.PM && project.pmId !== user.id) {
        throw ApiError.forbidden('Forbidden: You do not have access to this project');
      }

      // - Developer only projects containing a task assigned to them
      if (user.role === Role.DEVELOPER) {
        const hasAssignedTask = await prisma.task.findFirst({
          where: { projectId: query.projectId, assigneeId: user.id },
        });
        if (!hasAssignedTask) {
          throw ApiError.forbidden('Forbidden: You are not assigned to this project');
        }
      }

      where.projectId = query.projectId;
    } else {
      // Global feed scoped by role when projectId is not provided:
      // - PM only projects they own
      if (user.role === Role.PM) {
        const pmProjects = await prisma.project.findMany({
          where: { pmId: user.id },
          select: { id: true },
        });
        where.projectId = {
          in: pmProjects.map((p) => p.id),
        };
      } else if (user.role === Role.DEVELOPER) {
        // - Developer only projects containing a task assigned to them
        const devTasks = await prisma.task.findMany({
          where: { assigneeId: user.id },
          select: { projectId: true },
          distinct: ['projectId'],
        });
        where.projectId = {
          in: devTasks.map((t) => t.projectId),
        };
      }
      // - Admin can query across all projects (no projectId constraint)
    }

    if (query.since) {
      const sinceDate = new Date(query.since);
      if (!isNaN(sinceDate.getTime())) {
        where.createdAt = {
          gt: sinceDate,
        };
      }
    }

    // Direct database query on ActivityLog table - never an in-memory cache
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

