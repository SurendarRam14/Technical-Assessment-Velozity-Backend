import { Server } from 'socket.io';
import { getUserRoom } from '../rooms';

export interface NotificationNewPayload {
  id: string;
  message: string;
  taskId?: string | null;
  createdAt: string | Date;
}

export const emitNotificationNew = (
  io: Server,
  userId: string,
  payload: NotificationNewPayload
): void => {
  const room = getUserRoom(userId);
  io.to(room).emit('notification:new', payload);
};
