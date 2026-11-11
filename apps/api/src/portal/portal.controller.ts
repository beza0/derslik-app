import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ChangeRequestInput, DecideChangeRequestInput, IsoDateTime } from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { ChangeRequestsService } from '../lessons/change-requests.service';
import { PortalService } from './portal.service';

const Uuid = new ParseUUIDPipe({ version: '4' });
const PortalCalendarQuery = z.object({ from: IsoDateTime, to: IsoDateTime, studentId: z.uuid().optional() });
const PortalRequestInput = z.intersection(ChangeRequestInput, z.object({ studentId: z.uuid() }));

/** Öğrenci ve veli uçları. Hiçbir AI ucu bu katmanda yoktur. */
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly requests: ChangeRequestsService,
  ) {}

  @Get('calendar')
  calendar(@CurrentUser() u: AuthUser, @Query(new Zod(PortalCalendarQuery)) q: z.infer<typeof PortalCalendarQuery>) {
    return this.portal.calendar(u.id, new Date(q.from), new Date(q.to), q.studentId);
  }

  @Get('lessons/:id')
  lesson(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.portal.lesson(u.id, id);
  }

  @Post('lessons/:id/change-requests')
  createRequest(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(PortalRequestInput)) body: z.infer<typeof PortalRequestInput>) {
    const { studentId, ...input } = body;
    return this.requests.create(u.id, id, studentId, input);
  }

  @Get('change-requests')
  myRequests(@CurrentUser() u: AuthUser) {
    return this.requests.listForUser(u.id);
  }

  @Post('change-requests/:id/withdraw')
  @HttpCode(204)
  async withdraw(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    await this.requests.withdraw(u.id, id);
  }
}

@Controller('change-requests')
export class ChangeRequestsController {
  constructor(
    private readonly requests: ChangeRequestsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    const s = z.enum(['pending', 'approved', 'rejected', 'withdrawn']).optional().parse(status);
    return this.requests.listForTeacher(await this.access.teacher(u.id), s);
  }

  @Post(':id/decide')
  @HttpCode(200)
  async decide(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(DecideChangeRequestInput)) body: z.infer<typeof DecideChangeRequestInput>) {
    return this.requests.decide(await this.access.teacher(u.id), id, body);
  }
}
