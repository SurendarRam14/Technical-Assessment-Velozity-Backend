import { Router } from 'express';
import { Role } from '@prisma/client';
import { UsersController } from './users.controller';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// GET /api/users - Admin only per backend-spec.md
router.get('/', auth, requireRole(Role.ADMIN), asyncHandler(UsersController.listUsers));

export const userRoutes = router;
export default router;
