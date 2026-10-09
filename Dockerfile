# Prepare the context first: node scripts/docker-build-context.js prepare
# --source . --output <empty external directory>. Raw repository builds fail closed.
# This official multi-platform digest was resolved from the registry, not invented.
FROM node:22.23.2-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 AS base
RUN npm install --global npm@12.1.0 --ignore-scripts \
    && test "$(node --version)" = "v22.23.2" \
    && test "$(npm --version)" = "12.1.0"

# ── Stage 1: Install dependencies ──
FROM base AS deps
WORKDIR /app

# The prepared bundle includes every reviewed installation input. Its contents
# participate in this layer's cache key, including any future selected artifacts.
COPY .docker-install/ ./
RUN node scripts/docker-build-context.js verify-install --context . \
    && npm ci --legacy-peer-deps --strict-allow-scripts \
    && node scripts/docker-build-context.js verify-install --context . --after-install

# ── Stage 2: Build the application ──
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/docker-build-context.js verify --context . --with-node-modules

# NEXT_PUBLIC_* values are compiled into the browser bundle by Next.js.
# These values identify Firebase resources; server credentials remain runtime-only.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ARG NEXT_PUBLIC_DEMO_MODE=false
ARG NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true
ARG NEXT_PUBLIC_MFA_ENABLED=false
ARG NEXT_PUBLIC_ADMIN_COMMAND_GRID_V2=false
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=$NEXT_PUBLIC_GOOGLE_AUTH_ENABLED
ENV NEXT_PUBLIC_MFA_ENABLED=$NEXT_PUBLIC_MFA_ENABLED
ENV NEXT_PUBLIC_ADMIN_COMMAND_GRID_V2=$NEXT_PUBLIC_ADMIN_COMMAND_GRID_V2
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

RUN npm run build

# ── Stage 3: Production runner ──
FROM base AS runner
WORKDIR /app

ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV STRIPE_BUILD_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Next writes image-optimization and other runtime cache entries here.
RUN mkdir -p .next/cache \
    && chown nextjs:nodejs .next/cache \
    && chmod 0755 .next/cache

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
