# syntax=docker/dockerfile:1.7
# Multi-stage build: shared pnpm-workspace install, then per-service build.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY packages/game-core/package.json ./packages/game-core/
COPY apps/auth-service/package.json ./apps/auth-service/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages ./packages
COPY apps/auth-service ./apps/auth-service
RUN pnpm --filter @bgf/auth-service build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/auth-service/dist ./dist
COPY --from=build /repo/apps/auth-service/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
EXPOSE 3001
CMD ["node", "dist/main.js"]
