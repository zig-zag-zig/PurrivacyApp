# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS build
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:unchecked

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system nodeapp && useradd --system --gid nodeapp --home /app nodeapp

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/lib ./lib

USER nodeapp
EXPOSE 3002
# Run node directly (not via npm) so SIGTERM reaches the process for graceful shutdown.
CMD ["node", "--enable-source-maps", "lib/server.js"]
