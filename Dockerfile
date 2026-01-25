# syntax=docker/dockerfile:1

# --------- Builder stage ---------
FROM node:18-alpine AS builder

# Create app directory
WORKDIR /app

# Install app dependencies first (leverages Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of the application source
COPY . .

# --------- Production stage ---------
FROM node:18-alpine

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app .

# Remove any dev dependencies, clean npm cache and fix permissions
RUN npm prune --omit=dev && npm cache clean --force \
    && chown -R appuser:appgroup /app

# Switch to the non-privileged user
USER appuser

# Application runtime environment variables
ENV NODE_ENV=production \
    PORT=5000

# Expose the application port
EXPOSE 5000

# Healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5000) + '/api/health', res => { if(res.statusCode !== 200) process.exit(1) }).on('error', () => process.exit(1))"

# Default command
CMD ["node", "server.js"]
