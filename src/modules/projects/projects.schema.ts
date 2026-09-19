import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  clientId: z.string().uuid('Invalid client ID format'),
  pmId: z.string().uuid('Invalid PM ID format').optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
