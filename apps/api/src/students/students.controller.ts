import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  BulkStudentInput,
  DeleteStudentInput,
  StudentInput,
  StudentListQuery,
  StudentUpdate,
} from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { StudentsService } from './students.service';

const Uuid = new ParseUUIDPipe({ version: '4' });

@Controller('students')
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query(new Zod(StudentListQuery)) q: z.infer<typeof StudentListQuery>) {
    return this.students.list(await this.access.teacher(u.id), q.status, q.q);
  }

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body(new Zod(StudentInput)) body: StudentInput) {
    return this.students.create(await this.access.teacher(u.id), body);
  }

  @Post('bulk')
  async bulk(@CurrentUser() u: AuthUser, @Body(new Zod(BulkStudentInput)) body: BulkStudentInput) {
    return this.students.bulk(await this.access.teacher(u.id), body);
  }

  @Get(':id')
  async get(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    const t = await this.access.teacher(u.id);
    const [s, groups] = await Promise.all([this.students.get(t, id), this.students.groupsOf(t, id)]);
    return { ...s, groups };
  }

  @Patch(':id')
  async update(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(StudentUpdate)) body: StudentUpdate) {
    return this.students.update(await this.access.teacher(u.id), id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.students.archive(await this.access.teacher(u.id), id);
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  async unarchive(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.students.unarchive(await this.access.teacher(u.id), id);
  }

  /** Kalıcı silme: gövdede `confirmName` zorunlu. */
  @Post(':id/delete')
  @HttpCode(204)
  async remove(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(DeleteStudentInput)) body: { confirmName: string }) {
    await this.students.remove(await this.access.teacher(u.id), id, body.confirmName);
  }

  @Delete(':id/account-link')
  @HttpCode(204)
  async unlink(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    await this.students.unlinkAccount(await this.access.teacher(u.id), id);
  }

  @Get(':id/guardians')
  async guardians(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.students.listGuardians(await this.access.teacher(u.id), id);
  }

  @Patch(':id/guardians/:linkId')
  @HttpCode(204)
  async updateGuardian(
    @CurrentUser() u: AuthUser,
    @Param('id', Uuid) id: string,
    @Param('linkId', Uuid) linkId: string,
    @Body(new Zod(z.object({ canRequestChanges: z.boolean() }))) body: { canRequestChanges: boolean },
  ) {
    await this.students.updateGuardian(await this.access.teacher(u.id), id, linkId, body.canRequestChanges);
  }

  @Delete(':id/guardians/:linkId')
  @HttpCode(204)
  async removeGuardian(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Param('linkId', Uuid) linkId: string) {
    await this.students.removeGuardian(await this.access.teacher(u.id), id, linkId);
  }
}
