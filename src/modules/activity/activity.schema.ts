import { z } from 'zod';

export const getActivityQuerySchema = z.object({
  projectId: z.string().uuid('Invalid project ID format').optional(),
  since: z.string().optional(),
  limit: z.string().optional(),
});

export type GetActivityQuery = z.infer<typeof getActivityQuerySchema>;
