FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @greencity/db exec prisma generate
RUN pnpm --filter @greencity/shared build && pnpm --filter @greencity/db build && pnpm --filter @greencity/queue build

FROM base AS builder
COPY --from=deps /app /app
RUN pnpm --filter @greencity/api build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
EXPOSE 3010
CMD ["pnpm", "--filter", "@greencity/api", "start"]
