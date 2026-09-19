FROM node:20-alpine

# Install openssl and libc compatibility for Prisma on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install all dependencies (including devDependencies required for tsc build)
RUN npm install

# Copy Prisma schema and migrations
COPY prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy tsconfig and source code
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript to dist/
RUN npm run build

# Expose API and WebSocket port
EXPOSE 4000

# Execute database migrations, seed, and start server per Section 10 of backend-spec.md
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/server.js"]
