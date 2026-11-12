import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiActionDecision, AiMessageInput } from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { AiService } from './ai.service';

const Uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Yalnızca öğretmen: her uç `access.teacher` ile başlar; öğrenci/veli hesapları 403 alır.
 * Portal katmanında AI ucu yoktur.
 */
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly access: AccessService,
  ) {}

  @Post('messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  async message(@CurrentUser() u: AuthUser, @Body(new Zod(AiMessageInput)) body: z.infer<typeof AiMessageInput>) {
    return this.ai.message(await this.access.teacher(u.id), body);
  }

  @Post('actions/:id/decide')
  @HttpCode(200)
  async decide(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(AiActionDecision)) body: { decision: 'confirm' | 'reject' }) {
    return this.ai.decide(await this.access.teacher(u.id), id, body.decision);
  }

  @Post('actions/:id/undo')
  @HttpCode(200)
  async undo(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.ai.undo(await this.access.teacher(u.id), id);
  }

  @Get('conversations')
  async conversations(@CurrentUser() u: AuthUser) {
    return this.ai.conversations(await this.access.teacher(u.id));
  }

  @Get('conversations/:id')
  async conversation(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.ai.conversation(await this.access.teacher(u.id), id);
  }
}
