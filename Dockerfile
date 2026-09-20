# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js prerenders the generic 404 page. Its metadata needs a valid origin
# during build, but no environment-specific origin may survive in the output.
ENV APP_BASE_URL=https://preppy-build.invalid

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY next.config.ts next-env.d.ts tsconfig.json ./
COPY app ./app
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY types ./types

RUN npm run build && ! grep -R -q 'preppy-build.invalid' .next

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app /app

USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
