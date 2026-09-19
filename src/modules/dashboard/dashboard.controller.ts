import { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service';
import { ApiError } from '../../utils/apiError';

export class DashboardController {
  static async getAdminDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const result = await DashboardService.getAdminDashboard(req.user);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async getPmDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const result = await DashboardService.getPmDashboard(req.user);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async getDeveloperDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const result = await DashboardService.getDeveloperDashboard(req.user);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
