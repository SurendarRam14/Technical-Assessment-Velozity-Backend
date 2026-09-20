import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

export class UsersController {
  static async listUsers(req: Request, res: Response) {
    const role = req.query.role as Role | undefined;
    const search = req.query.search as string | undefined;

    const users = await UsersService.listUsers({ role, search });
    res.status(200).json({ users });
  }
}
