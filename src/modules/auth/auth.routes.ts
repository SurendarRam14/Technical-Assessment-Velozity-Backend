import { Router } from 'express';
import { Role } from '@prisma/client';
import { AuthController } from './auth.controller';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { loginSchema, registerSchema } from './auth.schema';

const router = Router();

// Public routes
router.post('/login', validate(loginSchema), asyncHandler(AuthController.login));
router.post('/refresh', asyncHandler(AuthController.refresh));
router.post('/logout', asyncHandler(AuthController.logout));

// Protected routes
router.post('/register', auth, requireRole(Role.ADMIN), validate(registerSchema), asyncHandler(AuthController.register));

export const authRoutes = router;
export default router;
