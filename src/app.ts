import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/users.routes';
import { clientRoutes } from './modules/clients/clients.routes';
import { projectRoutes } from './modules/projects/projects.routes';
import { taskRoutes } from './modules/tasks/tasks.routes';
import { activityRoutes } from './modules/activity/activity.routes';
import { notificationRoutes } from './modules/notifications/notifications.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { errorHandler } from './middleware/errorHandler';
import { ApiError } from './utils/apiError';

export const app: Application = express();

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

app.use(
  cors({
    origin: isAllowedOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Health Check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    phase: 'Phase 8 - Dashboard Module',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 handler
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(ApiError.notFound('Route not found'));
});

// Central Error Handler
app.use(errorHandler);

export default app;
