import { Priority, Role, TaskStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/apiError';
import { getOnlineUsersCount } from '../../sockets/handlers/presence.handler';

export class DashboardService {
  /**
   * Admin Dashboard:
   * Global totals, overdue count, presence count, status distribution, and recent activity feed.
   */
  static async getAdminDashboard(user: { id: string; role: Role }) {
    if (user.role !== Role.ADMIN) {
      throw ApiError.forbidden('Forbidden: Only Admins can access the Admin dashboard');
    }

    const [
      totalProjects,
      totalTasks,
      totalClients,
      totalUsers,
      overdueTasksCount,
      tasksByStatusRaw,
      recentActivity,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.task.count(),
      prisma.client.count(),
      prisma.user.count(),
      prisma.task.count({ where: { isOverdue: true } }),
      prisma.task.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.activityLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          task: {
            select: { id: true, title: true, projectId: true },
          },
        },
      }),
    ]);

    const tasksByStatus: Record<TaskStatus, number> = {
      [TaskStatus.TODO]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.IN_REVIEW]: 0,
      [TaskStatus.DONE]: 0,
    };

    tasksByStatusRaw.forEach((entry) => {
      tasksByStatus[entry.status] = entry._count.status;
    });

    let onlineUsersCount = 0;
    try {
      onlineUsersCount = getOnlineUsersCount();
    } catch {
      onlineUsersCount = 0;
    }

    return {
      totals: {
        totalProjects,
        totalTasks,
        totalClients,
        totalUsers,
        overdueTasksCount,
        onlineUsersCount,
      },
      tasksByStatus,
      recentActivity,
    };
  }

  /**
   * PM Dashboard:
   * Summary of PM's own projects, task breakdown by status & priority, due this week count,
   * project-by-project progress metrics, and recent activity on PM's projects.
   */
  static async getPmDashboard(user: { id: string; role: Role }) {
    if (user.role !== Role.PM) {
      throw ApiError.forbidden('Forbidden: Only Project Managers can access the PM dashboard');
    }

    // Fetch PM's projects
    const projects = await prisma.project.findMany({
      where: { pmId: user.id },
      include: {
        client: { select: { id: true, name: true } },
        tasks: {
          select: {
            id: true,
            status: true,
            priority: true,
            dueDate: true,
            isOverdue: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const projectIds = projects.map((p) => p.id);

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const tasksByStatus: Record<TaskStatus, number> = {
      [TaskStatus.TODO]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.IN_REVIEW]: 0,
      [TaskStatus.DONE]: 0,
    };

    const tasksByPriority: Record<Priority, number> = {
      [Priority.LOW]: 0,
      [Priority.MEDIUM]: 0,
      [Priority.HIGH]: 0,
      [Priority.CRITICAL]: 0,
    };

    let totalTasks = 0;
    let overdueTasksCount = 0;
    let dueThisWeekCount = 0;

    // Process all tasks across owned projects
    const projectsSummary = projects.map((project) => {
      let pTodo = 0;
      let pInProgress = 0;
      let pInReview = 0;
      let pDone = 0;
      let pOverdue = 0;

      project.tasks.forEach((task) => {
        totalTasks += 1;
        tasksByStatus[task.status] += 1;
        tasksByPriority[task.priority] += 1;

        if (task.isOverdue) {
          overdueTasksCount += 1;
          pOverdue += 1;
        }

        if (task.dueDate && task.dueDate >= now && task.dueDate <= in7Days && task.status !== TaskStatus.DONE) {
          dueThisWeekCount += 1;
        }

        if (task.status === TaskStatus.TODO) pTodo += 1;
        else if (task.status === TaskStatus.IN_PROGRESS) pInProgress += 1;
        else if (task.status === TaskStatus.IN_REVIEW) pInReview += 1;
        else if (task.status === TaskStatus.DONE) pDone += 1;
      });

      const pTotal = project.tasks.length;
      const progressPercentage = pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0;

      return {
        id: project.id,
        name: project.name,
        client: project.client,
        createdAt: project.createdAt,
        taskCounts: {
          total: pTotal,
          todo: pTodo,
          inProgress: pInProgress,
          inReview: pInReview,
          done: pDone,
          overdue: pOverdue,
        },
        progressPercentage,
      };
    });

    // Fetch recent activity on PM's projects
    const recentActivity = await prisma.activityLog.findMany({
      where: {
        projectId: { in: projectIds },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        task: {
          select: { id: true, title: true, projectId: true },
        },
      },
    });

    return {
      totals: {
        totalProjects: projects.length,
        totalTasks,
        overdueTasksCount,
        dueThisWeekCount,
      },
      tasksByStatus,
      tasksByPriority,
      projects: projectsSummary,
      recentActivity,
    };
  }

  /**
   * Developer Dashboard:
   * Assigned tasks summary, status/priority breakdown, and assigned tasks
   * sorted by priority (CRITICAL > HIGH > MEDIUM > LOW) then due date (ascending).
   */
  static async getDeveloperDashboard(user: { id: string; role: Role }) {
    if (user.role !== Role.DEVELOPER) {
      throw ApiError.forbidden('Forbidden: Only Developers can access the Developer dashboard');
    }

    const assignedTasks = await prisma.task.findMany({
      where: { assigneeId: user.id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    });

    const tasksByStatus: Record<TaskStatus, number> = {
      [TaskStatus.TODO]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.IN_REVIEW]: 0,
      [TaskStatus.DONE]: 0,
    };

    const tasksByPriority: Record<Priority, number> = {
      [Priority.LOW]: 0,
      [Priority.MEDIUM]: 0,
      [Priority.HIGH]: 0,
      [Priority.CRITICAL]: 0,
    };

    let overdueTasksCount = 0;
    let completedTasksCount = 0;

    assignedTasks.forEach((task) => {
      tasksByStatus[task.status] += 1;
      tasksByPriority[task.priority] += 1;

      if (task.isOverdue) {
        overdueTasksCount += 1;
      }

      if (task.status === TaskStatus.DONE) {
        completedTasksCount += 1;
      }
    });

    // Sort by priority (CRITICAL > HIGH > MEDIUM > LOW) then due date (ascending, nulls last)
    const priorityWeight: Record<Priority, number> = {
      [Priority.CRITICAL]: 4,
      [Priority.HIGH]: 3,
      [Priority.MEDIUM]: 2,
      [Priority.LOW]: 1,
    };

    assignedTasks.sort((a, b) => {
      const weightA = priorityWeight[a.priority];
      const weightB = priorityWeight[b.priority];

      if (weightA !== weightB) {
        return weightB - weightA; // higher priority first
      }

      if (a.dueDate && b.dueDate) {
        return a.dueDate.getTime() - b.dueDate.getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      return 0;
    });

    return {
      totals: {
        totalAssignedTasks: assignedTasks.length,
        overdueTasksCount,
        completedTasksCount,
      },
      tasksByStatus,
      tasksByPriority,
      assignedTasks,
    };
  }
}
