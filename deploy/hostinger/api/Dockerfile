FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache openssl
RUN npm install --global pnpm@9.15.4
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @kaafila/api... --no-frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @kaafila/shared build
RUN pnpm --filter @kaafila/api db:generate
RUN pnpm --filter @kaafila/api build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 4000
CMD ["pnpm", "--filter", "@kaafila/api", "start"]
