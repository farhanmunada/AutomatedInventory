import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// pnpm runs from apps/backend; root .env is two levels up
config({ path: resolve(process.cwd(), '../../.env') });
config();

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL must be set in .env');
}

export default defineConfig({
  schema: './src/core/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
  verbose: true,
  strict: true,
});