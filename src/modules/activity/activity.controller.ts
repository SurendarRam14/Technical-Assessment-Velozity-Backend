import { Request, Response } from 'express';
import { ActivityService } from './activity.service';
import { ApiError } from '../../utils/apiError';

export class ActivityController {
  static async listActivity(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const query = {
      projectId: req.query.projectId as string | undefined,
      since: req.query.since as string | undefined,
      limit: req.query.limit as string | undefined,
    };
    const activityLogs = await ActivityService.listActivity(req.user, query);
    res.status(200).json({ activityLogs });
  }
}
