import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Pool } from 'pg';
import { CONFIG, type AppConfig } from './config';
import { createDb, DB, PG_POOL } from './db/db';
import { AllExceptionsFilter } from './common/errors';
import { AuthGuard, TokenService } from './common/auth';
import { AccessService } from './common/access.service';
import { MailService } from './common/mail.service';
import { EntitlementsService } from './billing/entitlements.service';
import { BillingController } from './billing/billing.controller';
import { AuthService } from './auth/auth.service';
import { AuthController, MeController } from './auth/auth.controller';
import { StudentsService } from './students/students.service';
import { StudentsController } from './students/students.controller';
import { InvitesService } from './invites/invites.service';
import { InvitesController } from './invites/invites.controller';
import { HealthController } from './health.controller';
import { GroupsService } from './groups/groups.service';
import { GroupsController } from './groups/groups.controller';
import { LessonsService } from './lessons/lessons.service';
import { LessonsController } from './lessons/lessons.controller';
import { ChangeRequestsService } from './lessons/change-requests.service';
import { NotificationsService } from './notifications/notifications.service';
import { NotificationsController } from './notifications/notifications.controller';
import { RemindersService } from './notifications/reminders.service';
import { PortalService } from './portal/portal.service';
import { ChangeRequestsController, PortalController } from './portal/portal.controller';

@Global()
@Module({})
export class AppModule {
  static forRoot(config: AppConfig, pool: Pool): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: config.NODE_ENV === 'test' ? 10_000 : 120 }],
          skipIf: () => config.NODE_ENV === 'test',
        }),
      ],
      controllers: [
        HealthController,
        AuthController,
        MeController,
        StudentsController,
        InvitesController,
        BillingController,
        GroupsController,
        LessonsController,
        ChangeRequestsController,
        PortalController,
        NotificationsController,
      ],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: PG_POOL, useValue: pool },
        { provide: DB, useValue: createDb(pool) },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        TokenService,
        AccessService,
        MailService,
        EntitlementsService,
        AuthService,
        StudentsService,
        InvitesService,
        GroupsService,
        LessonsService,
        ChangeRequestsService,
        NotificationsService,
        RemindersService,
        PortalService,
      ],
      exports: [CONFIG, DB, AccessService, EntitlementsService, MailService],
    };
  }
}
