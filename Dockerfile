# syntax=docker/dockerfile:1
ARG PREVIOUS_IMAGE=asset-retention-bootstrap

FROM oven/bun:1.4.4 AS asset-retention-bootstrap
RUN mkdir -p /app/.output/public/assets

FROM ${PREVIOUS_IMAGE} AS previous

FROM oven/bun:1.4.4 AS base
WORKDIR /app

FROM base AS build
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# POSTHOG_API_KEY is a build secret (deploy:staging passes it from .env.production), so it stays out of
# the image and its history. With it, the build uploads the browser source maps to PostHog and deletes
# them (vite.config.ts); without it, the build makes none. Either way no .map may reach the public dir.
RUN --mount=type=bind,from=previous,source=/app/.output,target=/previous-output,readonly \
    --mount=type=secret,id=POSTHOG_API_KEY \
    POSTHOG_API_KEY="$(cat /run/secrets/POSTHOG_API_KEY 2>/dev/null)" bun run build && \
    bun run scripts/retain-build-assets.ts /app/.output/public/assets /previous-output/public/assets && \
    if find /app/.output/public -name '*.map' | grep .; then echo 'source maps would be served publicly' >&2; exit 1; fi

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
# PORT, EXPOSE below, and fly.toml's internal_port are the app's listen port — keep all three in sync.
ENV PORT=3000
# The web process runs the built server (.output); the migrate step and the operator scripts run
# from source (bun run src/db/migrate.ts, scripts/*.ts), so the runtime image carries the source
# tree + node_modules + drizzle migrations, not just .output.
COPY . .
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/.output /app/.output
USER bun
EXPOSE 3000
CMD ["bun", "run", ".output/server/index.mjs"]
