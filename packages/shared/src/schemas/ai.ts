import { z } from 'zod';

export const AiMessageInput = z.object({
  conversationId: z.uuid().optional(),
  text: z.string().trim().min(1).max(4000),
  /** Ses kaynaklıysa işaretlenir (yalnızca istatistik). */
  viaVoice: z.boolean().default(false),
  fileIds: z.array(z.uuid()).max(3).default([]),
});
export type AiMessageInput = z.infer<typeof AiMessageInput>;

export const AiActionDecision = z.object({ decision: z.enum(['confirm', 'reject']) });

export type AiActionStatus = 'proposed' | 'applied' | 'rejected' | 'stale' | 'expired' | 'failed' | 'undone';

export interface AiPreviewChange {
  kind: 'create' | 'update' | 'cancel' | 'delete' | 'publish';
  entity: string;
  summary: string;
  /** Örn. "18 Kasım 2026 Salı 18:00–19:00 (Europe/Istanbul)". */
  when?: string;
  who?: string;
}

export interface AiActionDto {
  id: string;
  tool: string;
  status: AiActionStatus;
  preview: AiPreviewChange[];
  warnings: string[];
  createdAt: string;
  result?: unknown;
}

export interface AiChoiceDto {
  question: string;
  options: { id: string; label: string }[];
}

export interface AiReplyDto {
  conversationId: string;
  text: string;
  actions: AiActionDto[];
  choices: AiChoiceDto[];
  /** AI'ın doğrudan kaydettiği ve geri alınabilen işlemler. */
  undoable: { actionId: string; summary: string }[];
}
