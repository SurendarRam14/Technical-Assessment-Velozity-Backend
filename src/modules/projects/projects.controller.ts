import { Request, Response } from 'express';
import { ProjectsService } from './projects.service';
import { ApiError } from '../../utils/apiError';

export class ProjectsController {
  static async listProjects(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const projects = await ProjectsService.listProjects(req.user);
    res.status(200).json({ projects });
  }

  static async getProjectById(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const project = await ProjectsService.getProjectById(req.user, id);
    res.status(200).json({ project });
  }

  static async createProject(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const project = await ProjectsService.createProject(req.user, req.body);
    res.status(201).json({ project });
  }
}
