# `build` compiles the page and writes the download file; its output is
# static, so it runs on the builder's own platform and a multi-arch build
# compiles once instead of under emulation. `web`, the last stage and the
# default target, is the box: nginx serving the page and the test endpoints,
# with Bun beside it running the run store (server/store.ts).
# server/entrypoint.sh starts both.

FROM --platform=$BUILDPLATFORM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build && head -c 100M /dev/urandom > downloading

FROM nginxinc/nginx-unprivileged:stable-alpine AS web
USER root
# Bun's musl build needs the C++ runtime that its own Alpine image installs.
RUN apk add --no-cache libgcc libstdc++ && mkdir /data && chown 101:101 /data
COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun
USER 101

COPY server/store.ts /app/server/
COPY src/lib/engine/stored.ts src/lib/engine/types.ts /app/src/lib/engine/
COPY --chmod=755 server/entrypoint.sh /usr/local/bin/boomerang-entrypoint
COPY nginx/default.conf.template /etc/nginx/templates/
COPY --from=build /app/build /usr/share/nginx/html
COPY --from=build /app/downloading /usr/share/nginx/html/downloading

# "browser" keeps runs in each visitor's browser and does not start the store.
ENV HISTORY=box
VOLUME /data
EXPOSE 3000
# The entrypoint passes this on to both processes; nginx's own default,
# SIGQUIT, would wait out a transfer in flight.
STOPSIGNAL SIGTERM
ENTRYPOINT ["boomerang-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]
