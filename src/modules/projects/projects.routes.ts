import { Router } from 'express';
import { Role } from '@prisma/client';
import { ProjectsController } from './projects.controller';
import { TasksController } from '../tasks/tasks.controller';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { createProjectSchema } from './projects.schema';
import { createTaskSchema } from '../tasks/tasks.schema';

const router = Router();

// GET /api/projects - admin (all), pm (own only)
router.get('/', auth, requireRole(Role.ADMIN, Role.PM), asyncHandler(ProjectsController.listProjects));

// POST /api/projects - admin, pm
router.post('/', auth, requireRole(Role.ADMIN, Role.PM), validate(createProjectSchema), asyncHandler(ProjectsController.createProject));

// GET /api/projects/:id - admin, owning pm, assigned devs (enforced in service layer)
router.get('/:id', auth, asyncHandler(ProjectsController.getProjectById));

// POST /api/projects/:id/tasks - admin, owning pm (enforced in service layer)
router.post(
  '/:id/tasks',
  auth,
  requireRole(Role.ADMIN, Role.PM),
  validate(createTaskSchema),
  asyncHandler(TasksController.createTask)
);

export const projectRoutes = router;
export default router;
