import { Router } from 'express';
import { NotificationsController } from './notifications.controller';
import { auth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// GET /api/notifications - authenticated (own only)
router.get('/', auth, asyncHandler(NotificationsController.listNotifications));

// PATCH /api/notifications/read-all - authenticated
router.patch('/read-all', auth, asyncHandler(NotificationsController.markAllAsRead));

// PATCH /api/notifications/:id/read - authenticated (owner only)
router.patch('/:id/read', auth, asyncHandler(NotificationsController.markAsRead));

export const notificationRoutes = router;
export default router;
