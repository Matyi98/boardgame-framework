import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@bgf/shared-types';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(req: RegisterRequest): Promise<AuthResponse> {
    const user = await this.users.create(req);
    return this.sign(user.userId, user.username);
  }

  async login(req: LoginRequest): Promise<AuthResponse> {
    const user = await this.users.verifyPassword(req.username, req.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.sign(user.userId, user.username);
  }

  private sign(userId: string, username: string): AuthResponse {
    const accessToken = this.jwt.sign({ sub: userId, username });
    return { userId, username, accessToken, expiresIn: 60 * 60 * 24 * 7 };
  }
}
