FROM node:20-slim

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

CMD ["npm", "start"]
