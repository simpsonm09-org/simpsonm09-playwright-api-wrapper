# syntax=docker/dockerfile:1

# Pinned by digest. Renovate keeps the tag and digest current through the shared
# preset, and the tag must stay equal to the playwright version in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27 AS base
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

FROM base AS build
# NODE_ENV=production is inherited from base and makes npm ci skip
# devDependencies, which would omit tsc. Force dev deps for the build.
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY fixture ./fixture
RUN npm run build && npm prune --omit=dev

# One image carries both the API and the tiny test fixture. Compose and CI start
# the fixture with a command override, and it is never exposed in production.
FROM base AS runtime
LABEL org.opencontainers.image.source="https://github.com/simpsonm09-org/simpsonm09-playwright-api-wrapper" \
      org.opencontainers.image.description="Lightweight HTTP API that runs one Playwright scenario per request." \
      org.opencontainers.image.licenses="MIT"
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
# Named scenarios for the flow-request path. FLOWS_FILE is relative to WORKDIR.
COPY flows ./flows
ENV FLOWS_FILE=flows/flows.json
USER pwuser
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
