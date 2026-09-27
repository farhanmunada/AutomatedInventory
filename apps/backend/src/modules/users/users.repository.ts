import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB_TOKEN } from '../../core/database/db.module';
import { users, type users as UsersTable } from '../../core/database/schema';

type Db = NodePgDatabase<{ users: typeof UsersTable }>;

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  findByUsername(username: string) {
    return this.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.username, username),
    });
  }

  findById(id: string) {
    return this.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, id),
    });
  }

  async create(username: string, passwordHash: string) {
    const rows = await this.db
      .insert(users)
      .values({ username, passwordHash })
      .returning({ id: users.id, username: users.username });
    return rows[0];
  }
}
