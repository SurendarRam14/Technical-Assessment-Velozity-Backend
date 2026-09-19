import { Router } from 'express';
import { Role } from '@prisma/client';
import { ClientsController } from './clients.controller';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { createClientSchema } from './clients.schema';

const router = Router();

// GET /api/clients - admin, pm (middleware + service layer guard)
router.get('/', auth, requireRole(Role.ADMIN, Role.PM), asyncHandler(ClientsController.listClients));

// POST /api/clients - admin only (middleware + service layer guard)
router.post('/', auth, requireRole(Role.ADMIN), validate(createClientSchema), asyncHandler(ClientsController.createClient));

export const clientRoutes = router;
export default router;
