FROM node:25-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json tsconfig.packages.json ./
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:25-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/packages ./packages
EXPOSE 3000
CMD ["node", "apps/server/dist/main.js"]
