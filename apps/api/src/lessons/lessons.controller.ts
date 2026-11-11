import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  Attendance,
  CalendarQuery,
  CancelLessonInput,
  CompleteLessonInput,
  CreateLessonInput,
  UpdateLessonInput,
} from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { LessonsService } from './lessons.service';

const Uuid = new ParseUUIDPipe({ version: '4' });

@Controller()
export class LessonsController {
  constructor(
    private readonly lessons: LessonsService,
    private readonly access: AccessService,
  ) {}

  @Get('calendar')
  async calendar(@CurrentUser() u: AuthUser, @Query(new Zod(CalendarQuery)) q: CalendarQuery) {
    return this.lessons.calendar(await this.access.teacher(u.id), q);
  }

  @Post('lessons')
  async create(@CurrentUser() u: AuthUser, @Body(new Zod(CreateLessonInput)) body: CreateLessonInput) {
    return this.lessons.create(await this.access.teacher(u.id), body);
  }

  @Get('lessons/:id')
  async get(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.lessons.get(await this.access.teacher(u.id), id);
  }

  @Patch('lessons/:id')
  async update(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(UpdateLessonInput)) body: UpdateLessonInput) {
    return this.lessons.update(await this.access.teacher(u.id), id, body);
  }

  @Post('lessons/:id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(CancelLessonInput)) body: z.infer<typeof CancelLessonInput>) {
    return this.lessons.cancel(await this.access.teacher(u.id), id, body);
  }

  @Post('lessons/:id/complete')
  @HttpCode(200)
  async complete(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(CompleteLessonInput)) body: z.infer<typeof CompleteLessonInput>) {
    return this.lessons.complete(await this.access.teacher(u.id), id, body);
  }

  @Put('lessons/:id/attendance/:studentId')
  @HttpCode(204)
  async attendance(
    @CurrentUser() u: AuthUser,
    @Param('id', Uuid) id: string,
    @Param('studentId', Uuid) studentId: string,
    @Body(new Zod(z.object({ attendance: Attendance }))) body: { attendance: z.infer<typeof Attendance> },
  ) {
    await this.lessons.setAttendance(await this.access.teacher(u.id), id, studentId, body.attendance);
  }

  @Get('students/:id/lessons')
  async forStudent(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Query('when') when?: string) {
    return this.lessons.forStudent(await this.access.teacher(u.id), id, when === 'past' ? 'past' : 'upcoming');
  }
}
