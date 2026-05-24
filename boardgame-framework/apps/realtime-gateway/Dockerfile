# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY packages/game-core/package.json ./packages/game-core/
COPY apps/realtime-gateway/package.json ./apps/realtime-gateway/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages ./packages
COPY apps/realtime-gateway ./apps/realtime-gateway
RUN pnpm --filter @bgf/realtime-gateway build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/realtime-gateway/dist ./dist
COPY --from=build /repo/apps/realtime-gateway/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
EXPOSE 3003
CMD ["node", "dist/main.js"]
