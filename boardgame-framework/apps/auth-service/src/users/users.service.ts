import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { RegisterRequest, UserSummary } from '@bgf/shared-types';
import { UserEntity } from './user.entity.js';

/**
 * In-memory user store. Swap for a Prisma-backed implementation when wiring
 * up Postgres; the interface stays the same so the rest of the service is
 * unaffected.
 */
@Injectable()
export class UsersService {
  private readonly byId = new Map<string, UserEntity>();
  private readonly byUsername = new Map<string, UserEntity>();

  async create(req: RegisterRequest): Promise<UserSummary> {
    if (this.byUsername.has(req.username)) {
      throw new ConflictException('Username already taken');
    }
    const passwordHash = await bcrypt.hash(req.password, 10);
    const user: UserEntity = {
      userId: randomUUID(),
      username: req.username,
      email: req.email ?? null,
      passwordHash,
      createdAt: new Date(),
    };
    this.byId.set(user.userId, user);
    this.byUsername.set(user.username, user);
    return { userId: user.userId, username: user.username };
  }

  async verifyPassword(username: string, password: string): Promise<UserSummary | null> {
    const user = this.byUsername.get(username);
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? { userId: user.userId, username: user.username } : null;
  }

  async findById(userId: string): Promise<UserSummary> {
    const user = this.byId.get(userId);
    if (!user) throw new NotFoundException('User not found');
    return { userId: user.userId, username: user.username };
  }
}
