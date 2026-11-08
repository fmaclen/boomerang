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
# UID and GID 101, as every image before, so a volume an older one wrote stays writable.
RUN addgroup -S -g 101 boomerang && adduser -S -D -H -u 101 -G boomerang boomerang && mkdir /data && chown 101:101 /data
USER 101:101
# "browser" keeps runs in each visitor's browser and never opens the store.
ENV HISTORY=box RUNS_DB=/data/runs.sqlite HOST=0.0.0.0 PORT=3000
# The page posts 8 MiB at a time; the server takes bodies up to this.
ENV BODY_SIZE_LIMIT=64M
# A stop waits this many seconds for transfers in flight before it ends them.
ENV SHUTDOWN_TIMEOUT=2
VOLUME /data
EXPOSE 3000
CMD ["bun", "build/index.js"]
