import { Request, Response } from 'express';
import { TasksService } from './tasks.service';
import { ApiError } from '../../utils/apiError';
import { listTasksQuerySchema } from './tasks.schema';

export class TasksController {
  static async listTasks(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const query = listTasksQuerySchema.parse(req.query);
    const tasks = await TasksService.listTasks(req.user, query);
    res.status(200).json({ tasks });
  }

  static async getTaskById(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const task = await TasksService.getTaskById(req.user, id);
    res.status(200).json({ task });
  }

  static async createTask(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const task = await TasksService.createTask(req.user, projectId, req.body);
    res.status(201).json({ task });
  }

  static async updateStatus(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await TasksService.updateTaskStatus(req.user, taskId, req.body);
    res.status(200).json(result);
  }

  static async getTaskActivity(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const activityLogs = await TasksService.getTaskActivity(req.user, taskId);
    res.status(200).json({ activityLogs });
  }
}
