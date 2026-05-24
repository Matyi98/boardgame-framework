# Getting started

## Prerequisites

- **Node.js 20+** (`node --version`)
- **pnpm 9+** (`npm install -g pnpm`)
- **Docker + Docker Compose**

## First-time setup

```bash
git clone <your fork URL>
cd boardgame-framework
pnpm install
cp .env.example .env
# (Edit .env — at minimum, change JWT_SECRET to something random)
```

## Running the whole stack

```bash
docker compose up --build
```

Wait for "ready" logs. Then visit:

- **<http://localhost>** — the web client
- **<http://localhost:8080>** — Traefik dashboard (see which routes are active)
- **<http://localhost:15672>** — RabbitMQ management (login: `bgf` / `changeme`)

To tear it down (and wipe data):

```bash
docker compose down -v
```

## Running just one service for development

You'll usually want to run one service locally with hot-reload and the rest in Docker.

```bash
# Bring up just the infra dependencies:
docker compose up postgres redis rabbitmq -d

# In another terminal, run the service you're working on:
pnpm --filter @bgf/auth-service dev
```

## Working in `game-core`

The core library has no I/O, so you can develop it with just tests.

```bash
pnpm --filter @bgf/game-core test --watch
```

This is the fastest dev loop: pure TypeScript, no Docker, no database.

## Adding a new service

1. `cp -r apps/auth-service apps/my-service`
2. Update `package.json` name and port.
3. Add a service block to `docker-compose.yml` (copy from auth-service).
4. Add Traefik labels for routing.

## Scaling services

```bash
docker compose up --scale game-engine=3 --scale realtime-gateway=2
```

Traefik will load-balance automatically. The realtime gateway uses sticky cookies so a given browser stays on the same instance.
