import { Request, Response } from 'express';
import { NotificationsService } from './notifications.service';
import { ApiError } from '../../utils/apiError';

export class NotificationsController {
  static async listNotifications(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const result = await NotificationsService.listNotifications(req.user.id);
    res.status(200).json(result);
  }

  static async markAsRead(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const notification = await NotificationsService.markAsRead(req.user.id, id);
    res.status(200).json({ notification });
  }

  static async markAllAsRead(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const result = await NotificationsService.markAllAsRead(req.user.id);
    res.status(200).json(result);
  }
}
