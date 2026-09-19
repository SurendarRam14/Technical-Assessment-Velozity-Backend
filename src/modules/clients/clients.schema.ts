import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
