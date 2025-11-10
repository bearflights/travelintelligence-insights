# Multi-stage build for insights-travelintelligence
# Handles local @bear/sso dependency

FROM node:18-alpine AS builder

# Set working directory
WORKDIR /build

# Copy SSO package (local dependency)
COPY bear.flights/sso ./bear.flights/sso

# Copy insights package files
COPY travelintelligence.club/package*.json ./travelintelligence.club/

# Copy insights lib directory
COPY travelintelligence.club/lib/ ./travelintelligence.club/lib/

# Install SSO dependencies first
WORKDIR /build/bear.flights/sso
RUN npm ci --omit=dev

# Install insights dependencies
WORKDIR /build/travelintelligence.club
RUN npm ci --omit=dev

# Copy insights application files
COPY travelintelligence.club/ .

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy from builder
COPY --from=builder /build/bear.flights/sso /app/node_modules/@bear/sso
COPY --from=builder /build/travelintelligence.club /app

# Expose port
EXPOSE 3002

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "app.js"]
