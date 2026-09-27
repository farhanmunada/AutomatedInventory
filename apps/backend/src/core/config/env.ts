import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// pnpm runs scripts from the package dir (apps/backend); root .env is two levels up
config({ path: resolve(process.cwd(), '../../.env') });
config(); // fallback: local .env if present

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),

  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.coerce.number().default(86_400), // seconds (24h)
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new Error(`Invalid environment variables: ${issues}`);
  }

  return parsed.data;
}

export const env = validateEnv();
