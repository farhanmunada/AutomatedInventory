import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { UsersService } from '../../modules/users/users.service';
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
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginRequestDto) {
    return this.usersService.login(dto.username, dto.password);
  }
}