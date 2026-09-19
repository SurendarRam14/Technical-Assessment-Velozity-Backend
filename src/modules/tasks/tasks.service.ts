import { Role, TaskStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/apiError';
import { CreateTaskInput, ListTasksQuery, UpdateTaskStatusInput } from './tasks.schema';
import { getIO } from '../../sockets';
import { emitActivityNew } from '../../sockets/handlers/task.handler';
import { NotificationsService } from '../notifications/notifications.service';

export class TasksService {
  static async createTask(
    user: { id: string; role: Role },
    projectId: string,
    input: CreateTaskInput
  ) {
    // Service-layer role scoping: Developers cannot create tasks
    if (user.role === Role.DEVELOPER) {
      throw ApiError.forbidden('Forbidden: Developers cannot create tasks');
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // PM can only create tasks in their own project
    if (user.role === Role.PM && project.pmId !== user.id) {
      throw ApiError.forbidden('Forbidden: You can only create tasks for projects you own');
    }

    // Validate assignee if provided
    if (input.assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: input.assigneeId },
      });
      if (!assignee) {
        throw ApiError.badRequest('Assigned user not found');
      }
    }

    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    const now = new Date();
    const isOverdue = !!(dueDate && dueDate < now && input.status !== TaskStatus.DONE);

    const task = await prisma.task.create({
      data: {
        projectId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        assigneeId: input.assigneeId || null,
        status: input.status,
        priority: input.priority,
        dueDate,
        isOverdue,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            pmId: true,
            client: { select: { id: true, name: true } },
          },
        },
        assignee: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Notify assignee if assigned to a user
    if (task.assigneeId) {
      try {
        await NotificationsService.createNotification(
          task.assigneeId,
          `You were assigned to task: "${task.title}"`,
          task.id
        );
      } catch {
        // Graceful fallback
      }
    }

    return task;
  }

  static async listTasks(user: { id: string; role: Role }, query: ListTasksQuery) {
    const where: any = {};

    // 1. Role-based scoping
    if (user.role === Role.DEVELOPER) {
      // Developers ONLY see tasks assigned to them
      where.assigneeId = user.id;
    } else if (user.role === Role.PM) {
      // PMs ONLY see tasks for projects they own
      where.project = {
        pmId: user.id,
      };

      // If specific projectId requested, verify ownership
      if (query.projectId) {
        const project = await prisma.project.findUnique({
          where: { id: query.projectId },
        });
        if (!project || project.pmId !== user.id) {
          throw ApiError.forbidden('Forbidden: You do not own this project');
        }
      }
    }

    // 2. Query filters
    if (query.projectId) {
      where.projectId = query.projectId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.dueFrom || query.dueTo) {
      where.dueDate = {};
      if (query.dueFrom) {
        const fromDate = new Date(query.dueFrom);
        if (!isNaN(fromDate.getTime())) {
          where.dueDate.gte = fromDate;
        }
      }
      if (query.dueTo) {
        const toDate = new Date(query.dueTo);
        if (!isNaN(toDate.getTime())) {
          where.dueDate.lte = toDate;
        }
      }
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            pmId: true,
            client: { select: { id: true, name: true } },
          },
        },
        assignee: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return tasks;
  }

  static async getTaskById(user: { id: string; role: Role }, taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            pmId: true,
            client: { select: { id: true, name: true } },
          },
        },
        assignee: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    // Service-layer ownership verification
    if (user.role === Role.PM) {
      if (task.project.pmId !== user.id) {
        throw ApiError.forbidden('Forbidden: You do not have access to tasks in this project');
      }
    } else if (user.role === Role.DEVELOPER) {
      if (task.assigneeId !== user.id) {
        throw ApiError.forbidden('Forbidden: You do not have access to this task');
      }
    }

    return task;
  }

  static async updateTaskStatus(
    user: { id: string; role: Role },
    taskId: string,
    input: UpdateTaskStatusInput
  ) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          select: { id: true, name: true, pmId: true },
        },
      },
    });

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    // Role check: admin, owning pm, assigned dev
    if (user.role === Role.PM) {
      if (task.project.pmId !== user.id) {
        throw ApiError.forbidden('Forbidden: You can only update tasks for projects you own');
      }
    } else if (user.role === Role.DEVELOPER) {
      if (task.assigneeId !== user.id) {
        throw ApiError.forbidden('Forbidden: You can only update tasks assigned to you');
      }
    }

    const fromStatus = task.status;
    const toStatus = input.status;

    // Perform atomic status update and ActivityLog insertion
    const [updatedTask, activityLog] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: {
          status: toStatus,
          isOverdue: toStatus === TaskStatus.DONE ? false : task.isOverdue,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              pmId: true,
              client: { select: { id: true, name: true } },
            },
          },
          assignee: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.activityLog.create({
        data: {
          taskId,
          projectId: task.projectId,
          userId: user.id,
          fromStatus,
          toStatus,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    // Emit real-time activity:new event to project room
    try {
      const io = getIO();
      emitActivityNew(io, {
        id: activityLog.id,
        taskId: activityLog.taskId,
        projectId: activityLog.projectId,
        userId: activityLog.userId,
        userName: activityLog.user?.name || 'User',
        fromStatus: activityLog.fromStatus,
        toStatus: activityLog.toStatus,
        createdAt: activityLog.createdAt,
      });
    } catch {
      // Socket server not initialized (e.g. CLI/isolated tests), ignore gracefully
    }

    // If task moved to IN_REVIEW, notify project manager
    if (toStatus === TaskStatus.IN_REVIEW && fromStatus !== TaskStatus.IN_REVIEW) {
      try {
        await NotificationsService.createNotification(
          task.project.pmId,
          `Task "${task.title}" was moved to IN_REVIEW`,
          task.id
        );
      } catch {
        // Graceful fallback
      }
    }

    return { task: updatedTask, activityLog };
  }

  static async getTaskActivity(user: { id: string; role: Role }, taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: { select: { pmId: true } },
      },
    });

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    // Scoping: admin, owning pm, assigned dev
    if (user.role === Role.PM) {
      if (task.project.pmId !== user.id) {
        throw ApiError.forbidden('Forbidden: You do not have access to this task');
      }
    } else if (user.role === Role.DEVELOPER) {
      if (task.assigneeId !== user.id) {
        throw ApiError.forbidden('Forbidden: You do not have access to this task');
      }
    }

    const activityLogs = await prisma.activityLog.findMany({
      where: { taskId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return activityLogs;
  }
}
