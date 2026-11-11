import { z } from 'zod';

export const GroupInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  studentIds: z.array(z.uuid()).max(200).default([]),
});
export type GroupInput = z.infer<typeof GroupInput>;

export const GroupMembershipChange = z.object({
  add: z.array(z.uuid()).max(200).default([]),
  remove: z.array(z.uuid()).max(200).default([]),
  /** Gelecek derslere ve açık ödevlere uygulansın mı? Önizleme sonrası açıkça seçilir. */
  applyToFutureLessons: z.boolean().default(false),
  applyToOpenAssignments: z.boolean().default(false),
});
export type GroupMembershipChange = z.infer<typeof GroupMembershipChange>;
