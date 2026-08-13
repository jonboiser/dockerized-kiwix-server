FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci || npm install --legacy-peer-deps

# Copy application source code
COPY . .

# Build SolidStart production bundle
RUN npm run build

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV ZIMDIR=/zims
ENV KIWIX_SERVER_URL=http://kiwix-serve:8080

COPY --from=builder /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
