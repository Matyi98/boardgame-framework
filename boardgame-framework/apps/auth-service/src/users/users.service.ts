import { ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import type { RegisterRequest, UserSummary } from '@bgf/shared-types';

/**
 * Postgres-backed user store via Prisma.
 *
 * This is a skeleton project with no migration pipeline (no `prisma migrate`
 * step in the build), so onModuleInit() guards table creation with a plain
 * `CREATE TABLE IF NOT EXISTS` instead — idempotent, safe to run on every
 * startup. Schema is mirrored in prisma/schema.prisma (used for codegen only;
 * keep both in sync if you add a column).
 */
@Injectable()
export class UsersService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma = new PrismaClient();

  async onModuleInit(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username      TEXT NOT NULL UNIQUE,
        email         TEXT,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async create(req: RegisterRequest): Promise<UserSummary> {
    const existing = await this.prisma.user.findUnique({ where: { username: req.username } });
    if (existing) throw new ConflictException('Username already taken');

    const passwordHash = await bcrypt.hash(req.password, 10);
    const user = await this.prisma.user.create({
      data: { username: req.username, email: req.email ?? null, passwordHash },
    });
    return { userId: user.id, username: user.username };
  }

  async verifyPassword(username: string, password: string): Promise<UserSummary | null> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? { userId: user.id, username: user.username } : null;
  }

  async findById(userId: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { userId: user.id, username: user.username };
  }
}
