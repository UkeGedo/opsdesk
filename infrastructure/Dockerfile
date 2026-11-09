FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS build
WORKDIR /workspace
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Preparar dependencias de producción en una estructura autónoma.
FROM build AS production-dependencies
RUN pnpm --filter @opsdesk/api deploy --prod --legacy /deploy

# Las herramientas de prueba no se incluyen en la imagen de ejecución.
FROM build AS test
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace/apps/api
ENV NODE_ENV=test
CMD ["pnpm", "test"]

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS api
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATABASE_PATH=/data/opsdesk.db
COPY --from=production-dependencies /deploy/node_modules ./node_modules
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/drizzle ./drizzle
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0 AS web
COPY infrastructure/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
