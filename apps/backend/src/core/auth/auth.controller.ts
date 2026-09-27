import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { UsersService } from '../../modules/users/users.service';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { Public } from './public.decorator';

class LoginRequestDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginRequestDto) {
    return this.usersService.login(dto.username, dto.password);
  }
}
