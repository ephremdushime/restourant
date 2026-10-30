# ===================================================
# Stage 1: Build Frontend Assets
# ===================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy application source code
COPY . .

# Compile Vite client bundle
RUN npm run build

# ===================================================
# Stage 2: Production Server Runtime
# ===================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install -g tsx

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend files and database schemas
COPY server.ts ./
COPY src/services ./src/services
COPY data ./data

# Ensure upload directory exists
RUN mkdir -p public/uploads/patron-photos && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["tsx", "server.ts"]

