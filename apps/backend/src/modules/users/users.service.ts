import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedError } from '../../core/errors/app-error';
import { UsersRepository } from './users.repository';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string): Promise<{
    access_token: string;
    user: { id: string; username: string };
  }> {
    const user = await this.usersRepository.findByUsername(username);

    if (!user) {
      throw new UnauthorizedError('Username atau password salah.');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Username atau password salah.');
    }

    const access_token = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
    });

    return { access_token, user: { id: user.id, username: user.username } };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async findByUsername(username: string) {
    return this.usersRepository.findByUsername(username);
  }

  async createUser(username: string, password: string) {
    const hash = await this.hashPassword(password);
    return this.usersRepository.create(username, hash);
  }
}
