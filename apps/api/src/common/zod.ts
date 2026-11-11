import { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** `@Body(new Zod(Schema))` — gövdeyi şemaya göre doğrular ve dönüştürür; hata AllExceptionsFilter'da 400 olur. */
export class Zod<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    return this.schema.parse(value ?? {});
  }
}
