import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { Role } from '@prisma/client';
import { prisma } from '../config/db';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { getProjectRoom, getUserRoom } from './rooms';
import {
  userConnected,
  userDisconnected,
  emitCurrentPresence,
  getOnlineUsersCount,
} from './handlers/presence.handler';

export { getOnlineUsersCount } from './handlers/presence.handler';

declare module 'socket.io' {
  interface Socket {
    user?: TokenPayload;
  }
}

let ioInstance: Server | null = null;

export const getIO = (): Server => {
  if (!ioInstance) {
    throw new Error('Socket.io has not been initialized yet');
  }
  return ioInstance;
};

export const initSocketServer = (httpServer: HttpServer): Server => {
  const isAllowedOrigin = (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    if (!origin) return callback(null, true);
    const clientUrl = process.env.CLIENT_URL;
    if (
      (clientUrl && origin === clientUrl) ||
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  };

  const io = new Server(httpServer, {
    cors: {
      origin: isAllowedOrigin,
      credentials: true,
    },
  });

  // 1. Handshake Authentication Middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const payload = verifyAccessToken(token);
      socket.user = payload;
      socket.data.user = payload;
      next();
    } catch (err: any) {
      return next(new Error('Authentication error: ' + (err.message || 'Invalid token')));
    }
  });

  // 2. Connection, Presence, and Room Joining Logic
  io.on('connection', async (socket: Socket) => {
    const user = socket.user || (socket.data.user as TokenPayload);
    if (!user) {
      socket.disconnect(true);
      return;
    }

    // Every socket joins its personal user room (for direct notifications)
    socket.join(getUserRoom(user.id));

    // Track online presence and broadcast updated presence count
    userConnected(io, socket, user.id);

    // Join role-scoped project rooms
    try {
      if (user.role === Role.ADMIN) {
        // Admin joins all project rooms
        const allProjects = await prisma.project.findMany({
          select: { id: true },
        });
        for (const p of allProjects) {
          socket.join(getProjectRoom(p.id));
        }
      } else if (user.role === Role.PM) {
        // PM joins all projects they own
        const pmProjects = await prisma.project.findMany({
          where: { pmId: user.id },
          select: { id: true },
        });
        for (const p of pmProjects) {
          socket.join(getProjectRoom(p.id));
        }
      } else if (user.role === Role.DEVELOPER) {
        // Developer joins projects where they have at least one assigned task
        const devTasks = await prisma.task.findMany({
          where: { assigneeId: user.id },
          select: { projectId: true },
          distinct: ['projectId'],
        });
        for (const t of devTasks) {
          socket.join(getProjectRoom(t.projectId));
        }
      }
    } catch (err) {
      console.error(`Error joining project rooms for user ${user.id}:`, err);
    }

    // Client can explicitly request current presence count
    socket.on('presence:join', () => {
      emitCurrentPresence(socket);
    });

    // On disconnect, update presence count and broadcast
    socket.on('disconnect', () => {
      userDisconnected(io, user.id);
    });
  });

  ioInstance = io;
  return io;
};
