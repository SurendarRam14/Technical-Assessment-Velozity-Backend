import { Server } from 'socket.io';
import { getProjectRoom } from '../rooms';

export interface ActivityNewPayload {
  id: string;
  taskId: string;
  projectId: string;
  userId: string;
  userName: string;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string | Date;
}

export const emitActivityNew = (io: Server, payload: ActivityNewPayload) => {
  const room = getProjectRoom(payload.projectId);
  io.to(room).emit('activity:new', payload);
};
