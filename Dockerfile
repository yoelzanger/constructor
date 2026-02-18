
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client (using the postgres schema if available, otherwise default)
# We assume schema.prisma is updated or we use an env var to switch provider?
# Actually, we will copy the postgres schema to overwrite the default one for build.
COPY prisma/schema.postgres.prisma prisma/schema.prisma

# Environment variables must be present at build time for next build? 
# Usually yes, but for standalone output we can inject them at runtime.
# However, Prisma needs DATABASE_URL at generation time IF it validates connection? No, only for migration.
# But "prisma generate" needs the schema.
ENV NEXT_TELEMETRY_DISABLED 1

RUN npx prisma generate
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
# mkdir .next before chown
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy necessary files for the custom server/scripts if needed
# The standalone build includes minimal files.
# But we need "scripts/process-pdfs.js" if we want to run it.
# And the prisma generated client is inside .next/standalone/node_modules? Or src/generated?
# Our schema defined output = "../src/generated/prisma"
# The standalone build might not include that custom path automatically if it's not imported?
# It IS imported by the app, so it should be included.
# But let's verify. Standalone traces imports.
# Just in case, copy the generated client manually if it's outside node_modules (which it is).
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

# Also copy scripts folder for the worker
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Ensure data directory exists and is writable
RUN mkdir -p /app/data/pdfs && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT 3000
# set hostname to localhost
ENV HOSTNAME "0.0.0.0"

# We use a custom start command to run migrations before starting the app?
# Or just start the app. Migrations should be run separately or via a startup script.
# For simplicity in this dockerfile, we just run the app.
CMD ["node", "server.js"]
