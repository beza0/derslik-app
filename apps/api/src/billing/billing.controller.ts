import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { CheckoutInput } from '@derslik/shared';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { AccessService } from '../common/access.service';
import { Zod } from '../common/zod';
import { BillingService } from './billing.service';
import { EntitlementsService } from './entitlements.service';

const Uuid = new ParseUUIDPipe({ version: '4' });

@Controller('billing')
export class BillingController {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly billing: BillingService,
    private readonly access: AccessService,
  ) {}

  @Get('entitlement')
  async entitlement(@CurrentUser() u: AuthUser) {
    const t = await this.access.teacher(u.id);
    return this.entitlements.entitlement(t.workspaceId);
  }

  @Public()
  @Get('plans')
  plans() {
    return this.billing.plans();
  }

  @Post('checkout')
  async checkout(@CurrentUser() u: AuthUser, @Body(new Zod(CheckoutInput)) body: { planVersionId: string }) {
    return this.billing.checkout(await this.access.teacher(u.id), body.planVersionId);
  }

  @Get('checkout/:id')
  async checkoutStatus(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.billing.checkoutStatus(await this.access.teacher(u.id), id);
  }

  /** Yalnızca sandbox: test ödeme ekranındaki düğme. Gerçek para çekilmez. */
  @Post('sandbox/:id/pay')
  @HttpCode(200)
  async sandboxPay(
    @CurrentUser() u: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(new Zod(z.object({ outcome: z.enum(['success', 'fail']).default('success') }))) body: { outcome: 'success' | 'fail' },
  ) {
    return this.billing.sandboxPay(await this.access.teacher(u.id), id, body.outcome);
  }

  @Post('cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() u: AuthUser) {
    return this.billing.cancel(await this.access.teacher(u.id));
  }

  /** Sağlayıcı webhook'u: imza ham gövde üzerinden doğrulanır. */
  @Public()
  @Post('webhooks/:provider')
  @HttpCode(200)
  webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>, @Headers('x-signature') signature?: string) {
    return this.billing.handleWebhook(provider, req.rawBody?.toString('utf8') ?? '', signature);
  }
}
