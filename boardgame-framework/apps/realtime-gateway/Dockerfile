# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate
WORKDIR /repo

FROM base AS build
COPY .npmrc pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/realtime-gateway ./apps/realtime-gateway
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile=false
RUN pnpm --filter @bgf/shared-types     build
RUN pnpm --filter @bgf/event-bus        build
RUN pnpm --filter @bgf/realtime-gateway build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/realtime-gateway/dist ./dist
COPY --from=build /repo/apps/realtime-gateway/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages     ./packages
EXPOSE 3003
CMD ["node", "dist/main.js"]
