import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { PlanInput, PlanVersionInput } from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { AdminService } from './admin.service';

const Uuid = new ParseUUIDPipe({ version: '4' });

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  private async guard(u: AuthUser) {
    await this.admin.assertAdmin(u.id);
  }

  @Get('stats')
  async stats(@CurrentUser() u: AuthUser) {
    await this.guard(u);
    return this.admin.stats();
  }

  @Get('errors')
  async errors(@CurrentUser() u: AuthUser) {
    await this.guard(u);
    return this.admin.errors();
  }

  @Get('users')
  async users(@CurrentUser() u: AuthUser, @Query('q') q?: string) {
    await this.guard(u);
    return this.admin.users(q?.slice(0, 100));
  }

  @Post('users/:id/status')
  @HttpCode(204)
  async status(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(z.object({ status: z.enum(['active', 'suspended']) }))) b: { status: 'active' | 'suspended' }) {
    await this.guard(u);
    await this.admin.setUserStatus(u.id, id, b.status);
  }

  @Get('plans')
  async plans(@CurrentUser() u: AuthUser) {
    await this.guard(u);
    return this.admin.plans();
  }

  @Post('plans')
  async createPlan(@CurrentUser() u: AuthUser, @Body(new Zod(PlanInput)) b: z.infer<typeof PlanInput>) {
    await this.guard(u);
    return this.admin.createPlan(u.id, b);
  }

  @Patch('plans/:id')
  async updatePlan(
    @CurrentUser() u: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(new Zod(z.object({ name: z.string().trim().min(1).max(80).optional(), isPublic: z.boolean().optional() }))) b: { name?: string; isPublic?: boolean },
  ) {
    await this.guard(u);
    return this.admin.updatePlan(u.id, id, b);
  }

  @Post('plans/:id/versions')
  async addVersion(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(PlanVersionInput)) b: z.infer<typeof PlanVersionInput>) {
    await this.guard(u);
    return this.admin.addVersion(u.id, id, b);
  }

  @Post('workspaces/:id/grant')
  async grant(
    @CurrentUser() u: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(new Zod(z.object({ planVersionId: z.uuid(), days: z.number().int().min(1).max(3650) }))) b: { planVersionId: string; days: number },
  ) {
    await this.guard(u);
    return this.admin.grant(u.id, id, b.planVersionId, b.days);
  }

  @Get('settings')
  async settings(@CurrentUser() u: AuthUser) {
    await this.guard(u);
    return this.admin.settings();
  }

  @Put('settings/:key')
  @HttpCode(204)
  async setSetting(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body(new Zod(z.object({ value: z.unknown() }))) b: { value: unknown }) {
    await this.guard(u);
    await this.admin.setSetting(u.id, z.string().regex(/^[a-z0-9_.]{2,60}$/).parse(key), b.value);
  }

  @Get('audit')
  async audit(@CurrentUser() u: AuthUser) {
    await this.guard(u);
    return this.admin.auditLog();
  }

  @Post('workspaces/:id/support-access')
  async requestAccess(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(z.object({ reason: z.string().trim().min(10).max(500) }))) b: { reason: string }) {
    await this.guard(u);
    return this.admin.requestAccess(u.id, id, b.reason);
  }

  @Get('workspaces/:id/support-view')
  async supportView(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    await this.guard(u);
    return this.admin.supportView(u.id, id);
  }
}

/** Öğretmen tarafı: destek erişim taleplerini görür ve onaylar/reddeder. */
@Controller('support-access')
export class SupportAccessController {
  constructor(
    private readonly admin: AdminService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    return this.admin.teacherGrants(await this.access.teacher(u.id));
  }

  @Post(':id/decide')
  @HttpCode(200)
  async decide(
    @CurrentUser() u: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(new Zod(z.object({ decision: z.enum(['approve', 'deny', 'revoke']), hours: z.number().int().min(1).max(72).default(24) }))) b: { decision: 'approve' | 'deny' | 'revoke'; hours: number },
  ) {
    return this.admin.decideGrant(await this.access.teacher(u.id), id, b.decision, b.hours);
  }
}
