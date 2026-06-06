# syntax=docker/dockerfile:1.7
# Copy source first, then install — avoids pnpm workspace symlink issues
# with Docker overlay layers. The pnpm store is cached via BuildKit mount.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate
WORKDIR /repo

# ── build ────────────────────────────────────────────────────────────────────
FROM base AS build
COPY .npmrc pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/auth-service ./apps/auth-service
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile=false
RUN pnpm --filter @bgf/shared-types  build
RUN pnpm --filter @bgf/auth-service  build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/auth-service/dist ./dist
COPY --from=build /repo/apps/auth-service/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages     ./packages
EXPOSE 3001
CMD ["node", "dist/main.js"]
