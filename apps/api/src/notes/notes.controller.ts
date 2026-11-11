import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AssessmentInput, NoteInput, NoteUpdate } from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { NotesService } from './notes.service';

const Uuid = new ParseUUIDPipe({ version: '4' });
const AssessmentPatch = AssessmentInput.partial();

@Controller()
export class NotesController {
  constructor(
    private readonly notes: NotesService,
    private readonly access: AccessService,
  ) {}

  @Get('students/:id/notes')
  async list(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.notes.listNotes(await this.access.teacher(u.id), id);
  }

  @Post('notes')
  async create(@CurrentUser() u: AuthUser, @Body(new Zod(NoteInput)) body: z.infer<typeof NoteInput>) {
    return this.notes.createNote(await this.access.teacher(u.id), body);
  }

  @Patch('notes/:id')
  async update(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(NoteUpdate)) body: z.infer<typeof NoteUpdate>) {
    return this.notes.updateNote(await this.access.teacher(u.id), id, body);
  }

  @Delete('notes/:id')
  @HttpCode(204)
  async remove(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    await this.notes.deleteNote(await this.access.teacher(u.id), id);
  }

  @Get('students/:id/assessments')
  async assessments(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.notes.listAssessments(await this.access.teacher(u.id), id);
  }

  @Get('students/:id/progress')
  async progress(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.notes.progress(await this.access.teacher(u.id), id);
  }

  @Post('assessments')
  async createAssessment(@CurrentUser() u: AuthUser, @Body(new Zod(AssessmentInput)) body: z.infer<typeof AssessmentInput>) {
    return this.notes.createAssessment(await this.access.teacher(u.id), body);
  }

  @Patch('assessments/:id')
  async updateAssessment(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(AssessmentPatch)) body: z.infer<typeof AssessmentPatch>) {
    return this.notes.updateAssessment(await this.access.teacher(u.id), id, body);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  async deleteAssessment(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    await this.notes.deleteAssessment(await this.access.teacher(u.id), id);
  }

  @Get('portal/notes')
  portalNotes(@CurrentUser() u: AuthUser, @Query('studentId') studentId?: string) {
    return this.notes.portalNotes(u.id, studentId ? z.uuid().parse(studentId) : undefined);
  }

  @Get('portal/assessments')
  portalAssessments(@CurrentUser() u: AuthUser, @Query('studentId') studentId?: string) {
    return this.notes.portalAssessments(u.id, studentId ? z.uuid().parse(studentId) : undefined);
  }
}
