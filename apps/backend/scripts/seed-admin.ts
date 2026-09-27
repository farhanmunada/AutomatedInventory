import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { UsersService } from '../src/modules/users/users.service';
import { AppModule } from '../src/app.module';

async function main(): Promise<void> {
  const username = process.argv.find((a) => a.startsWith('--username='))?.slice(11);
  const password = process.argv.find((a) => a.startsWith('--password='))?.slice(11);

  if (!username || !password) {
    // eslint-disable-next-line no-console
    console.error('Usage: pnpm seed:admin --username=admin --password=<password>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  app.enableShutdownHooks();
  const usersService = app.get(UsersService);

  try {
    const existing = await usersService.findByUsername(username);
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`User "${username}" already exists. Skipping.`);
      return;
    }

    const user = await usersService.createUser(username, password);
    // eslint-disable-next-line no-console
    console.log(`Admin user created: ${user.username} (${user.id})`);
  } finally {
    await app.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exit(1);
  },
);
