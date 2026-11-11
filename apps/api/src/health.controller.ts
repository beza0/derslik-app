import { Controller, Get, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import { Public } from './common/auth';
import { PG_POOL } from './db/db';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Public()
  @Get()
  async health() {
    await this.pool.query('SELECT 1');
    return { ok: true };
  }
}
