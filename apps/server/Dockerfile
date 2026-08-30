# syntax=docker/dockerfile:1
#
# Monorepo-aware build. Build context must be the repository root
# (compose files set `context: ../..`, `dockerfile: apps/server/Dockerfile`).
# Base image pinned by digest - bump deliberately with dependency automation.

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS shared-build
WORKDIR /repo/packages/shared
COPY packages/shared/package*.json ./
RUN npm ci --no-audit --no-fund
COPY packages/shared/ ./
RUN npm run build

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS deps
WORKDIR /repo
RUN mkdir -p packages/shared/dist
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package*.json apps/server/
RUN npm ci --prefix apps/server --no-audit --no-fund

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS build
WORKDIR /repo
ENV NODE_ENV=development
COPY --from=deps /repo/apps/server/node_modules ./apps/server/node_modules
COPY packages/shared/ ./packages/shared/
COPY --from=shared-build /repo/packages/shared/dist ./packages/shared/dist
COPY apps/server/ ./apps/server/
WORKDIR /repo/apps/server
RUN npm run build:unchecked

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS runtime
# Mirrors the monorepo layout so the file: dependency resolves (see Pawify note).
WORKDIR /app/apps/server
ENV NODE_ENV=production

RUN groupadd --system nodeapp && useradd --system --gid nodeapp --home /app nodeapp

COPY packages/shared/package*.json /app/packages/shared/
COPY --from=shared-build /repo/packages/shared/dist /app/packages/shared/dist
COPY apps/server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /repo/apps/server/lib ./lib

USER nodeapp
EXPOSE 3002
# Run node directly (not via npm) so SIGTERM reaches the process for graceful shutdown.
CMD ["node", "--enable-source-maps", "lib/server.js"]
