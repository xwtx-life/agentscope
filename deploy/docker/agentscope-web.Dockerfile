FROM node:22-bookworm-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app
COPY examples/web_ui/package.json examples/web_ui/pnpm-lock.yaml examples/web_ui/pnpm-workspace.yaml ./
COPY examples/web_ui/frontend/package.json ./frontend/package.json
COPY examples/web_ui/backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile

COPY examples/web_ui/frontend ./frontend
RUN pnpm --filter frontend build

FROM nginx:1.27-alpine

COPY deploy/docker/agentscope-web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
