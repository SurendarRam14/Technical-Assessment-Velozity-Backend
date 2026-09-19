import { Router } from 'express';
import { Role } from '@prisma/client';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { DashboardController } from './dashboard.controller';

export const dashboardRoutes = Router();

// GET /api/dashboard/admin - Admin only
dashboardRoutes.get(
  '/admin',
  auth,
  requireRole(Role.ADMIN),
  DashboardController.getAdminDashboard
);

// GET /api/dashboard/pm - PM only
dashboardRoutes.get(
  '/pm',
  auth,
  requireRole(Role.PM),
  DashboardController.getPmDashboard
);

// GET /api/dashboard/developer - Developer only
dashboardRoutes.get(
  '/developer',
  auth,
  requireRole(Role.DEVELOPER),
  DashboardController.getDeveloperDashboard
);
