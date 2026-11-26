FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install --global pnpm@9.15.4
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @kaafila/web... --no-frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @kaafila/shared build
RUN pnpm --filter @kaafila/web build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@kaafila/web", "start"]
