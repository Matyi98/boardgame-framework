# Traefik configuration

Traefik is configured entirely via Docker labels on each service in `docker-compose.yml`. There's no static config file to maintain.

When you add a new service:

1. Set `traefik.enable=true`.
2. Define a router rule, e.g. `traefik.http.routers.myservice.rule=PathPrefix(\`/api/myservice\`)`.
3. Tell Traefik which port to forward to: `traefik.http.services.myservice.loadbalancer.server.port=PORT`.

For WebSocket services, also add sticky cookies:
```
traefik.http.services.myservice.loadbalancer.sticky.cookie=true
```

The dashboard at <http://localhost:8080> shows live route resolution — useful for debugging.
