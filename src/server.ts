import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { app } from './app';
import { initSocketServer } from './sockets';
import { startOverdueTasksJob } from './jobs/overdueTasks.job';

const PORT = process.env.PORT || 4000;

const httpServer = http.createServer(app);

// Initialize Socket.io
initSocketServer(httpServer);

// Start background jobs
startOverdueTasksJob();

const server = httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server initialized`);
  console.log(`Overdue tasks cron job initialized (every 5 minutes)`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default server;
