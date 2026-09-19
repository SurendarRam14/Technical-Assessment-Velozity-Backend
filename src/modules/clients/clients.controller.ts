import { Request, Response } from 'express';
import { ClientsService } from './clients.service';
import { ApiError } from '../../utils/apiError';

export class ClientsController {
  static async listClients(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const clients = await ClientsService.listClients(req.user);
    res.status(200).json({ clients });
  }

  static async createClient(req: Request, res: Response) {
    if (!req.user) throw ApiError.unauthorized();
    const client = await ClientsService.createClient(req.user, req.body);
    res.status(201).json({ client });
  }
}
