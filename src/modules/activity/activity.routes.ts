import { Router } from 'express';
import { ActivityController } from './activity.controller';
import { auth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// GET /api/activity?projectId=&since=&limit=20 - catch-up endpoint
router.get('/', auth, asyncHandler(ActivityController.listActivity));

export const activityRoutes = router;
export default router;
