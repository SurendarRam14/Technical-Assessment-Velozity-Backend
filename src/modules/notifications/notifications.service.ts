import { prisma } from '../../config/db';
import { ApiError } from '../../utils/apiError';
import { getIO } from '../../sockets';
import { emitNotificationNew } from '../../sockets/handlers/notification.handler';

export class NotificationsService {
  static async createNotification(userId: string, message: string, taskId?: string | null) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        message,
        taskId: taskId || null,
        read: false,
      },
    });

    // Emit real-time notification:new event to the user room
    try {
      const io = getIO();
      emitNotificationNew(io, userId, {
        id: notification.id,
        message: notification.message,
        taskId: notification.taskId,
        createdAt: notification.createdAt,
      });
    } catch {
      // Ignore if socket server is not yet running (e.g. standalone scripts/CLI)
    }

    return notification;
  }

  static async listNotifications(userId: string) {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        include: {
          task: {
            select: { id: true, title: true, projectId: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.notification.count({
        where: { userId, read: false },
      }),
    ]);

    return { notifications, unreadCount };
  }

  static async markAsRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw ApiError.notFound('Notification not found');
    }

    if (notification.userId !== userId) {
      throw ApiError.forbidden('Forbidden: You do not have access to this notification');
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return updated;
  }

  static async markAllAsRead(userId: string) {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return { message: 'All notifications marked as read' };
  }
}
