# `build` compiles the page and its server. The output is plain JavaScript, so
# it runs on the builder's own platform and a multi-arch build compiles once
# instead of under emulation. `box`, the last stage and the default target,
# is Bun alone running it: the page, the endpoints it measures against, and
# the store for past runs, all one process (see src/routes and src/lib/server).

FROM --platform=$BUILDPLATFORM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4-alpine AS box
WORKDIR /app
COPY --from=build /app/build ./build
RUN mkdir /data && chown bun:bun /data
USER bun
# "browser" keeps runs in each visitor's browser and never opens the store.
ENV HISTORY=box RUNS_DB=/data/runs.sqlite HOST=0.0.0.0 PORT=3000
# A stop waits this many seconds for transfers in flight before it ends them.
ENV SHUTDOWN_TIMEOUT=2
VOLUME /data
EXPOSE 3000
CMD ["bun", "build/index.js"]
