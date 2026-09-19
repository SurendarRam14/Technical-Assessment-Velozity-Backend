import { Request, Response } from 'express';
import { ActivityService } from './activity.service';
import { ApiError } from '../../utils/apiError';
import { getActivityQuerySchema } from './activity.schema';

export class ActivityController {
  static async listActivity(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const query = getActivityQuerySchema.parse(req.query);
    const activityLogs = await ActivityService.listActivity(req.user, query);
    res.status(200).json({ activityLogs });
  }
}

