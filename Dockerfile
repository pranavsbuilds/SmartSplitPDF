FROM node:20-slim

LABEL org.opencontainers.image.title="SmartSplit PDF" \
      org.opencontainers.image.description="Splits PDFs into color and black-and-white streams" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Install system dependencies required for canvas/font rendering
RUN apt-get update && apt-get install -y \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Copy package definition files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source code (excluding items in .dockerignore)
COPY . .

# Ensure upload directories exist and are writable by the non-root 'node' user
RUN mkdir -p uploads/results && chown -R node:node /app

# Switch to the non-root node user for security
USER node

# Expose standard port
EXPOSE 3000

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
