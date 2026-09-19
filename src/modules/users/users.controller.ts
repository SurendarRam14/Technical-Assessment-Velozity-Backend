import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

export class UsersController {
  static async listUsers(req: Request, res: Response) {
    const roleFilter = req.query.role as Role | undefined;
    const users = await UsersService.listUsers(roleFilter);
    res.status(200).json({ users });
  }
}
