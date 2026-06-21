FROM mcr.microsoft.com/playwright:v1.52.0-noble AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/scraper ./apps/scraper
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @greencity/db exec prisma generate
RUN pnpm --filter @greencity/shared build && pnpm --filter @greencity/scraper-core build && pnpm --filter @greencity/db build && pnpm --filter @greencity/queue build && pnpm --filter @greencity/scraper build

FROM base AS runner
WORKDIR /app
COPY --from=deps /app /app
CMD ["node", "apps/scraper/dist/index.js"]
