#!/bin/sh
# The box is two processes in one container: the run store and nginx. This
# starts both, and when either exits it stops the other, so the container
# exits with it and Docker's restart policy brings the pair back together.

# Anything but "browser" keeps runs on the box. nginx writes this value into
# the page's meta tag, so it is settled here, before the template renders.
[ "$HISTORY" = browser ] || HISTORY=box
export HISTORY

pids=
if [ "$HISTORY" = box ]; then
  bun /app/server/store.ts &
  pids=$!
fi

# The nginx image's own entrypoint renders the config template, then execs nginx.
/docker-entrypoint.sh "$@" &
pids="$pids $!"

trap 'stopping=1' TERM INT QUIT

# Checks once a second that both are still up. busybox's `wait -n` misses a
# child killed from outside, so it cannot do this. The sleep runs in the
# background so a stop signal interrupts the wait straight away.
while [ -z "$stopping" ] && kill -0 $pids 2>/dev/null; do
  sleep 1 &
  wait $!
done
kill -TERM $pids 2>/dev/null
wait $pids
