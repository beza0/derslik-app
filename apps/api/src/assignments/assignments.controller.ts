import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AssignmentInput, AssignmentUpdate, ReviewInput, SafeUrl, SubmissionInput } from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { AssignmentsService } from './assignments.service';

const Uuid = new ParseUUIDPipe({ version: '4' });
const ListQuery = z.object({ studentId: z.uuid().optional(), status: z.enum(['draft', 'published']).optional() });
const PortalSubmit = z.intersection(SubmissionInput, z.object({ studentId: z.uuid() }));
const MaterialInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  url: SafeUrl.nullable().optional(),
  fileId: z.uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

@Controller()
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly access: AccessService,
  ) {}

  @Get('assignments')
  async list(@CurrentUser() u: AuthUser, @Query(new Zod(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.assignments.list(await this.access.teacher(u.id), q);
  }

  @Post('assignments')
  async create(@CurrentUser() u: AuthUser, @Body(new Zod(AssignmentInput)) body: AssignmentInput) {
    return this.assignments.create(await this.access.teacher(u.id), body);
  }

  @Get('assignments/:id')
  async get(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.assignments.detail(await this.access.teacher(u.id), id);
  }

  @Patch('assignments/:id')
  async update(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(AssignmentUpdate)) body: AssignmentUpdate) {
    return this.assignments.update(await this.access.teacher(u.id), id, body);
  }

  @Post('assignments/:id/publish')
  @HttpCode(200)
  async publish(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.assignments.publish(await this.access.teacher(u.id), id);
  }

  @Delete('assignments/:id')
  @HttpCode(204)
  async remove(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    await this.assignments.remove(await this.access.teacher(u.id), id);
  }

  @Get('recipients/:id')
  async recipient(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.assignments.recipientDetail(await this.access.teacher(u.id), id);
  }

  @Post('recipients/:id/review')
  @HttpCode(200)
  async review(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(ReviewInput)) body: z.infer<typeof ReviewInput>) {
    return this.assignments.review(await this.access.teacher(u.id), id, body);
  }

  @Get('materials')
  async materials(@CurrentUser() u: AuthUser) {
    return this.assignments.listMaterials(await this.access.teacher(u.id));
  }

  @Post('materials')
  async createMaterial(@CurrentUser() u: AuthUser, @Body(new Zod(MaterialInput)) body: z.infer<typeof MaterialInput>) {
    return this.assignments.createMaterial(await this.access.teacher(u.id), body);
  }

  @Delete('materials/:id')
  @HttpCode(204)
  async deleteMaterial(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    await this.assignments.deleteMaterial(await this.access.teacher(u.id), id);
  }

  // Öğrenci/veli
  @Get('portal/assignments')
  portalList(@CurrentUser() u: AuthUser, @Query('studentId') studentId?: string) {
    return this.assignments.portalList(u.id, studentId ? z.uuid().parse(studentId) : undefined);
  }

  @Get('portal/assignments/:id')
  portalDetail(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Query('studentId') studentId?: string) {
    return this.assignments.portalDetail(u.id, id, studentId ? z.uuid().parse(studentId) : undefined);
  }

  @Post('portal/assignments/:id/submissions')
  submit(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(PortalSubmit)) body: z.infer<typeof PortalSubmit>) {
    const { studentId, ...input } = body;
    return this.assignments.submit(u.id, id, studentId, input);
  }
}
