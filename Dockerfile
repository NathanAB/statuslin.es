# syntax=docker/dockerfile:1
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS build
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
# PORT, EXPOSE below, and fly.toml's internal_port are the app's listen port — keep all three in sync.
ENV PORT=3000
# The web process runs the built server (.output); the worker and the migrate step run from
# source (bun run scripts/worker.ts, bun run src/db/migrate.ts), so the runtime image carries
# the source tree + node_modules + drizzle migrations, not just .output.
COPY . .
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/.output /app/.output
USER bun
EXPOSE 3000
CMD ["bun", "run", ".output/server/index.mjs"]
