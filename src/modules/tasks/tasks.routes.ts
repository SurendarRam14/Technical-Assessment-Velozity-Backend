import { Router } from 'express';
import { TasksController } from './tasks.controller';
import { auth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { updateTaskStatusSchema } from './tasks.schema';

const router = Router();

// GET /api/tasks?status=&priority=&dueFrom=&dueTo=&projectId= - role scoped in service
router.get('/', auth, asyncHandler(TasksController.listTasks));

// GET /api/tasks/:id - role scoped in service
router.get('/:id', auth, asyncHandler(TasksController.getTaskById));

// PATCH /api/tasks/:id/status - admin, owning pm, assigned dev (scoped in service)
router.patch(
  '/:id/status',
  auth,
  validate(updateTaskStatusSchema),
  asyncHandler(TasksController.updateStatus)
);

// GET /api/tasks/:id/activity - scoped in service
router.get('/:id/activity', auth, asyncHandler(TasksController.getTaskActivity));

export const taskRoutes = router;
export default router;
