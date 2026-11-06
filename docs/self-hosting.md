# Self-hosting Boomerang

This guide sets Boomerang up on a Docker host in a homelab. You end with one
container from `ghcr.io/fmaclen/boomerang`, serving the page and its test
endpoints on one port and keeping every run in a Docker volume, reachable
from the devices you want to test from.

Work through the steps in order. Each ends on a **check** with its exact
expected output; the step is done when the check passes, and not before.

## Before you start

Settle three choices with the box's owner. Where they have no preference,
take the default.

| Choice | Default | Alternatives |
| --- | --- | --- |
| Port | `24610` | Any free TCP port on the host. |
| Reach | The LAN | The tailnet, or a reverse proxy you already run. See step 4. |
| Runs kept | On the box, shared by every browser | In each browser only. See step 2. |

The examples use `24610` and `~/boomerang`. Substitute your own port
everywhere `24610` appears.

## The box check

Every step that changes how the box is reached ends with this. Set `BOX` to
the address under test, then run:

```sh
BOX=http://127.0.0.1:24610
for p in / /history /ping; do curl -s -o /dev/null -w "%{http_code} $p\n" "$BOX$p"; done
curl -s -o /dev/null -H 'Accept-Encoding: gzip, br, zstd' -w "%{http_code} /downloading %{size_download}\n" "$BOX/downloading"
head -c 33554432 /dev/zero | curl -s -o /dev/null -w "%{http_code} /upload %{size_upload}\n" --data-binary @- "$BOX/upload"
```

It passes when it prints exactly:

```
200 /
200 /history
204 /ping
200 /downloading 104857600
200 /upload 33554432
```

`/downloading` must arrive as exactly 104857600 bytes: any other size means
something in front of the box compressed it. `/upload` must take all 32 MB
and answer `200`. `413` means something in front of the box caps request
bodies below the 64 MB the page needs; fewer bytes than 33554432 means a
proxy passed the box's early answer on and cut the upload short (see
[Reverse proxies](#reverse-proxies)).

## 1. Check the host

```sh
docker compose version
uname -m
```

**Check:** the first prints `Docker Compose version v2` or later, and the
second prints `x86_64`, `aarch64` or `arm64` (the image is built for
`linux/amd64` and `linux/arm64`). If `docker compose` is not a command,
install Docker Engine with its Compose plugin before going on.

## 2. Write the Compose file

```sh
mkdir -p ~/boomerang && cd ~/boomerang
```

Write `~/boomerang/compose.yml`:

```yaml
name: boomerang

services:
  boomerang:
    image: ghcr.io/fmaclen/boomerang:latest
    ports:
      - "127.0.0.1:24610:3000"
    volumes:
      - runs:/data
    restart: unless-stopped

volumes:
  runs:
```

The container listens on `3000`; the left side of `ports` is the host
address and port. It starts on loopback so you can prove it before anything
else can reach it. Step 4 widens it.

If the owner chose to keep runs in each browser only, add this to the
`boomerang` service and delete both `volumes` blocks:

```yaml
    environment:
      HISTORY: browser
```

**Check:** `docker compose config --quiet` prints nothing and exits `0`.

## 3. Start the box

```sh
cd ~/boomerang
docker compose up -d
```

If it fails with `address already in use`, the port is taken: pick another,
change it in `compose.yml`, and run it again.

**Check:** `docker compose ps --format '{{.Service}} {{.State}}'` prints
`boomerang running`, and the box check passes with
`BOX=http://127.0.0.1:24610`.

## 4. Make it reachable

Pick the section for the reach chosen above. Whichever it is, the page must
sit at `/` of its own address: it asks for `/downloading`, `/upload`, `/ping`
and `/_app/` by absolute path, so it cannot live under a path prefix such as
`https://example.com/speed/`.

### The LAN

Find the host's LAN address (`ip -4 -br addr` on Linux) and put it in front
of the port in `compose.yml`, for example:

```yaml
    ports:
      - "192.168.1.20:24610:3000"
```

`"24610:3000"` with no address publishes on every interface instead, tailnet
and any other network the host is on included. On Linux, Docker's published
ports bypass `ufw` and `firewalld` rules, so the address in this line is the
only gate.

```sh
docker compose up -d
```

**Check:** the box check passes with `BOX=http://192.168.1.20:24610`, run from
another machine on the LAN if you have a shell on one, otherwise from the
host.

### The tailnet

Leave the box on loopback and let Tailscale Serve publish it over HTTPS on
the same port. The tailnet needs MagicDNS and HTTPS certificates turned on;
`tailscale serve` says so and prints the admin link if they are not.

```sh
sudo tailscale serve --bg --https=24610 http://127.0.0.1:24610
tailscale serve status
```

`--bg` keeps the mount across reboots. Give the box its own port, as here,
rather than a path on `443`: a path mount forwards its prefix to the box,
and every request the page makes would miss.

**Check:** `tailscale serve status` lists
`https://<host>.<tailnet>.ts.net:24610` proxying to `http://127.0.0.1:24610`,
and the box check passes with `BOX` set to that address, run from another
device on the tailnet.

### A reverse proxy

Leave the box on loopback if the proxy runs on the host itself, and point the
proxy at `127.0.0.1:24610`. If the proxy runs in Docker, point it at
`boomerang:3000` instead, and in `compose.yml` replace the `ports` block with
the proxy's network (`docker network ls` names it):

```yaml
    networks:
      - proxy

networks:
  proxy:
    external: true
```

The `networks:` lines go in the `boomerang` service, and the top-level
`networks:` block beside `volumes:`. Then `docker compose up -d` and
configure the proxy from [Reverse proxies](#reverse-proxies) below.

**Check:** the box check passes with `BOX` set to the address the proxy
serves.

## 5. Run a test in a browser

This step needs a browser. If you have none, hand it to the owner with the
address from step 4.

1. Open the address, press **Start**, and wait for the result.
2. Open History with the **History** button in the top bar, or at
   `/history`.
3. Open `/history` at the same address in a second browser or on a second
   device.
4. `docker compose restart`, then reload History in either browser.

**Check:** the run appears in History in both browsers, and is still there
after the restart. If the owner chose to keep runs in each browser only, it
appears only in the browser that took it.

## Update to a new release

`latest` follows each release. To update:

```sh
cd ~/boomerang
old=$(docker compose images -q boomerang)
docker compose pull
docker compose up -d
docker image rm "$old"
```

The last line removes the image you replaced. It fails harmlessly when there
was no new release, or when another container still uses that image.

To stay on one release instead, set `image:` to a version tag from the
repository's releases, for example `ghcr.io/fmaclen/boomerang:1.2.0`. Update
by changing the tag and running the same commands. To roll back, put the
previous tag back and run `docker compose up -d`.

**Check:** `docker compose images -q boomerang` prints a different ID from
`$old` (or the same one, when there was no new release), the box check
passes, and History still lists the runs from before the update.

## Reverse proxies

The box answers `POST /upload` before it has read the body, then drains the
body. A proxy that streams the upload through passes that early answer back
and drops the rest of the body, so the browser sees its upload reset and
loses the sample. Caddy and Traefik do this by default. The fix is to have
the proxy read the whole body first, up to the 64 MB the box accepts. In
the other direction, the proxy must not compress or buffer `/downloading`.
The configs below do both, and nothing else. Each passed the box check and a
browser run through it, on Caddy 2.11, nginx 1.30 and Traefik 3.7.

Mount the box at `/` of its own hostname or port, as step 4 explains.
Replace `speed.example.com` with your hostname, and `127.0.0.1:24610` with
`boomerang:3000` when the proxy runs in Docker. Leave out any compression
on this site (Caddy's `encode`, nginx's `gzip`, Traefik's `compress`
middleware); the box check catches it if one is applied.

### Caddy

```
speed.example.com {
	reverse_proxy 127.0.0.1:24610 {
		request_buffers 64MiB
	}
}
```

Write `64MiB`: Caddy reads `64MB` as decimal, short of the box's limit.

### nginx

```nginx
server {
    listen 80;
    server_name speed.example.com;
    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:24610;
        proxy_buffering off;
    }
}
```

`client_max_body_size` lifts nginx's 1 MB default, which refuses the
page's uploads with `413`. `proxy_buffering off` stops nginx copying every
download stream to a temporary file. Leave `proxy_request_buffering` on, as
it is by default: turned off, nginx streams the body through and cuts slow
uploads short like the others.

### Traefik

Raise the read timeout on the entrypoint that serves the box (`web` here).
Traefik v3 closes any request still sending after 60 s, which cuts off a
slow upload. In Traefik's static configuration:

```
--entrypoints.web.transport.respondingTimeouts.readTimeout=120s
```

Then in the dynamic configuration, a router with a buffering middleware:

```yaml
http:
  routers:
    boomerang:
      rule: Host(`speed.example.com`)
      entryPoints: [web]
      service: boomerang
      middlewares: [boomerang-buffer]
  middlewares:
    boomerang-buffer:
      buffering:
        maxRequestBodyBytes: 67108864
  services:
    boomerang:
      loadBalancer:
        servers:
          - url: http://127.0.0.1:24610
```

The middleware needs at least one field (`buffering: {}` is rejected and
the route answers 404), and `67108864` is the box's 64 MB limit.

## Tunnels measure the tunnel

The page measures the path between the browser and whatever answers its
requests. Through a Cloudflare Tunnel, Tailscale Funnel, or any similar
relay, that is the path through someone else's servers, not the link
between your devices and the box. A tailnet connection that has fallen back
to a DERP relay is the same: it measures the relay. Reach the page through a
tunnel if you must, but read the numbers as the tunnel's.

To see which path a tailnet device takes, run `tailscale ping <box host>`
on it. `via <ip>:<port>` is a direct connection, and `via DERP(<region>)` is
relayed.
