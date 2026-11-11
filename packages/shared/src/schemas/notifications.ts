import { z } from 'zod';

export const NotificationCategory = z.enum(['lesson', 'reminder', 'assignment', 'feedback', 'request', 'system']);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

export const NotificationPrefInput = z.object({
  category: NotificationCategory,
  enabled: z.boolean(),
});

export interface NotificationDto {
  id: string;
  category: NotificationCategory;
  type: string;
  /** i18n anahtarı + parametreler; özel içerik (not metni, cevap anahtarı) taşımaz. */
  titleKey: string;
  params: Record<string, string>;
  link: string;
  readAt: string | null;
  createdAt: string;
}
