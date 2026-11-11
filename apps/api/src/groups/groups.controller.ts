import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { GroupInput, GroupMembershipChange } from '@derslik/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { GroupsService } from './groups.service';

const Uuid = new ParseUUIDPipe({ version: '4' });
const GroupPatch = z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().trim().max(500).nullable().optional() });

@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query('archived') archived?: string) {
    return this.groups.list(await this.access.teacher(u.id), archived === 'true');
  }

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body(new Zod(GroupInput)) body: GroupInput) {
    return this.groups.create(await this.access.teacher(u.id), body);
  }

  @Get(':id')
  async get(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.groups.detail(await this.access.teacher(u.id), id);
  }

  @Patch(':id')
  async update(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(GroupPatch)) body: z.infer<typeof GroupPatch>) {
    return this.groups.update(await this.access.teacher(u.id), id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.groups.setArchived(await this.access.teacher(u.id), id, true);
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  async unarchive(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.groups.setArchived(await this.access.teacher(u.id), id, false);
  }

  /** Üyelik değişikliğinin etkisini gösterir; hiçbir şey yazmaz. */
  @Post(':id/members/preview')
  @HttpCode(200)
  async preview(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(GroupMembershipChange)) body: GroupMembershipChange) {
    return this.groups.previewMembership(await this.access.teacher(u.id), id, body);
  }

  @Post(':id/members')
  @HttpCode(200)
  async apply(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string, @Body(new Zod(GroupMembershipChange)) body: GroupMembershipChange) {
    return this.groups.applyMembership(await this.access.teacher(u.id), id, body);
  }
}
