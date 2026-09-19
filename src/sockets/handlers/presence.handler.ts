import { Server, Socket } from 'socket.io';
import { PRESENCE_ROOM } from '../rooms';

// Track unique online users and their active socket count (to handle multi-tabbing gracefully)
const connectedUsers = new Map<string, number>();

export const getOnlineUsersCount = (): number => {
  return connectedUsers.size;
};

export const userConnected = (io: Server, socket: Socket, userId: string): void => {
  const currentCount = connectedUsers.get(userId) || 0;
  connectedUsers.set(userId, currentCount + 1);

  // Ensure socket is in presence room
  socket.join(PRESENCE_ROOM);

  // Broadcast updated presence count to all clients in presence room
  io.to(PRESENCE_ROOM).emit('presence:count', { count: connectedUsers.size });
};

export const userDisconnected = (io: Server, userId: string): void => {
  const currentCount = connectedUsers.get(userId);

  if (currentCount !== undefined) {
    if (currentCount <= 1) {
      connectedUsers.delete(userId);
    } else {
      connectedUsers.set(userId, currentCount - 1);
    }
  }

  // Broadcast updated presence count to all clients remaining in presence room
  io.to(PRESENCE_ROOM).emit('presence:count', { count: connectedUsers.size });
};

export const emitCurrentPresence = (socket: Socket): void => {
  socket.emit('presence:count', { count: connectedUsers.size });
};
