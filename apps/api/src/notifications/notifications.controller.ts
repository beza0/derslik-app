import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { NotificationPrefInput } from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { Zod } from '../common/zod';
import { NotificationsService } from './notifications.service';

const ListQuery = z.object({
  cursor: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  unread: z.enum(['true', 'false']).optional(),
});

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new Zod(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.notifications.list(u.id, { cursor: q.cursor, limit: q.limit, unreadOnly: q.unread === 'true' });
  }

  @Get('unread-count')
  async unread(@CurrentUser() u: AuthUser) {
    return { count: await this.notifications.unreadCount(u.id) };
  }

  @Post('read')
  @HttpCode(204)
  async read(
    @CurrentUser() u: AuthUser,
    @Body(new Zod(z.object({ ids: z.array(z.uuid()).max(200).optional(), all: z.boolean().optional() }))) body: { ids?: string[]; all?: boolean },
  ) {
    await this.notifications.markRead(u.id, body.all ? 'all' : (body.ids ?? []));
  }

  @Get('prefs')
  prefs(@CurrentUser() u: AuthUser) {
    return this.notifications.prefs(u.id);
  }

  @Put('prefs')
  @HttpCode(204)
  async setPref(@CurrentUser() u: AuthUser, @Body(new Zod(NotificationPrefInput)) body: z.infer<typeof NotificationPrefInput>) {
    await this.notifications.setPref(u.id, body.category, body.enabled);
  }
}
