import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AcceptInviteInput, CreateInviteInput } from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { InvitesService } from './invites.service';

const Uuid = new ParseUUIDPipe({ version: '4' });

@Controller()
export class InvitesController {
  constructor(
    private readonly invites: InvitesService,
    private readonly access: AccessService,
  ) {}

  @Post('students/:id/invites')
  async create(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(CreateInviteInput)) body: CreateInviteInput) {
    return this.invites.create(await this.access.teacher(u.id), id, body);
  }

  @Get('students/:id/invites')
  async list(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.invites.list(await this.access.teacher(u.id), id);
  }

  @Post('groups/:id/invites')
  async createForGroup(
    @CurrentUser() u: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(new Zod(z.object({ ttlDays: z.number().int().min(1).max(30).default(7) }))) body: { ttlDays: number },
  ) {
    return this.invites.createForGroup(await this.access.teacher(u.id), id, body.ttlDays);
  }

  @Delete('invites/:id')
  @HttpCode(204)
  async revoke(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    await this.invites.revoke(await this.access.teacher(u.id), id);
  }

  /** Giriş yapmadan da davetin kime ait olduğunu gösterir (kabul ekranı). */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('invites/preview')
  preview(@Body(new Zod(AcceptInviteInput)) body: { code: string }) {
    return this.invites.preview(body.code);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('invites/accept')
  accept(@CurrentUser() u: AuthUser, @Body(new Zod(AcceptInviteInput)) body: { code: string }) {
    return this.invites.accept(u.id, body.code);
  }

  /** Öğrenci/veli kendi bağlantısını kaldırır. */
  @Delete('me/links/:studentId')
  @HttpCode(204)
  async leave(@CurrentUser() u: AuthUser, @Param('studentId', Uuid) studentId: string) {
    await this.invites.leave(u.id, studentId);
  }
}
