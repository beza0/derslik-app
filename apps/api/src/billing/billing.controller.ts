import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { EntitlementsService } from './entitlements.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly access: AccessService,
  ) {}

  @Get('entitlement')
  async entitlement(@CurrentUser() u: AuthUser) {
    const t = await this.access.teacher(u.id);
    return this.entitlements.entitlement(t.workspaceId);
  }
}
