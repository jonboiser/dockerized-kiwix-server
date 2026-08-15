# dockerized-kiwix-server

The fastest way to bootstrap a personal [Kiwix](https://kiwix.org) server: two
containers and one shared folder.

**Who this is for:** if you know what a terminal is and have Docker (or
Podman) installed, you'll be reading offline Wikipedia in about 5 minutes.
No Kiwix knowledge required.

- **kiwix** — the official [`ghcr.io/kiwix/kiwix-tools`](https://github.com/kiwix/kiwix-tools/pkgs/container/kiwix-tools)
  image running `kiwix-serve`, serving every ZIM in `./zims` on port **8080**.
- **frontend** — a tiny Python image (standard library only, ~60 lines of CSS,
  **zero JavaScript**) for browsing the Kiwix catalog and downloading ZIM
  files straight into the shared volume, on port **3000**.

```
┌─────────────────────────┐       ┌────────────────────────┐
│ frontend localhost:3000 │       │ kiwix-serve :8080      │
│ search catalog,         │──────>│ serves /zims/*.zim     │
│ download & delete ZIMs  │       │                        │
└────────────┬────────────┘       └───────────┬────────────┘
             └──────────  ./zims  ────────────┘
```

## Why not just use the official Kiwix app?

For one computer or phone, you probably should. The official
[Kiwix Reader](https://get.kiwix.org/en/solutions/applications/) already has a
catalog, downloads ZIMs, and provides a polished native reading experience.
The official Kiwix Server is also the simpler choice when you already manage
your ZIM files and only need to serve them.

This project is deliberately a small, hackable layer around the official
`kiwix-tools` image. Its useful differences are:

- the server, downloader, storage, and ports are captured in one Compose file;
- the browser-based management page works on a headless home server or NAS;
- all ZIM files live in an ordinary `./zims` directory that is easy to back up,
  sync, or replace;
- the frontend is one Python file with no framework or JavaScript build step;
- it is easy to fork and add your own catalog filters, branding, authentication,
  scheduled downloads, reverse proxy, storage layout, or backup policy.

It is not intended to replace Kiwix Reader or improve the actual reading UI.
Think of it as a minimal starting point for a custom, self-hosted Kiwix appliance.

## Quick start (Docker)

```shell
git clone https://github.com/jonboiser/dockerized-kiwix-server.git
cd dockerized-kiwix-server
docker compose up -d
```

1. Open <http://localhost:3000>, search the catalog, and click **Download**.
   The page auto-refreshes while downloads run (via `<meta refresh>`, not JS).
2. When a download completes, the frontend **restarts kiwix-serve for you**
   through the mounted container socket — no terminal trip needed.
3. Open <http://localhost:8080> and start reading.

Stop everything with `docker compose down`.

> **Why the restart?** `kiwix-serve` only loads the ZIM files listed when it
> starts. The frontend automates the restart after downloads and deletes (and
> offers a **Restart the server now** button) by talking to the runtime
> socket mounted at `/var/run/docker.sock`. If you'd rather not mount the
> socket — note it grants the frontend container full control over your
> container runtime, acceptable for personal use but worth knowing — remove
> that volume line from `compose.yaml` and run `docker compose restart kiwix`
> manually instead.

## Share it on your local network

The default Compose configuration exposes the Kiwix library on every network
interface at port **8080**, while keeping the download/admin frontend restricted
to `localhost:3000`. This is intentional: the frontend can delete files and has
access to the container runtime socket, so other LAN devices should not be able
to open it.

1. Run the stack on the computer that will act as the server:

   ```shell
   docker compose up -d
   ```

2. On that computer, download content through <http://localhost:3000>.

3. Find the server's LAN address. It usually looks like `192.168.1.42` or
   `10.0.0.15`:

   ```shell
   hostname -I              # Linux
   ipconfig getifaddr en0   # macOS Wi-Fi
   ```

   On Windows, run `ipconfig` and look for the active adapter's **IPv4 Address**.

4. From a phone, tablet, or computer on the same Wi-Fi/Ethernet network, open:

   ```text
   http://SERVER_IP:8080
   ```

   For example: `http://192.168.1.42:8080`.

5. If it does not connect, allow inbound TCP port `8080` in the server's
   firewall. On Ubuntu with UFW:

   ```shell
   sudo ufw allow 8080/tcp
   ```

No Kiwix app is required on client devices; they use an ordinary web browser.
Do not configure router port forwarding for port 8080 unless you also add proper
internet-facing security. This setup is intended for a trusted LAN.

To administer a headless server remotely without exposing port 3000, use an SSH
tunnel from your computer:

```shell
ssh -L 3000:localhost:3000 you@SERVER_IP
```

Then open <http://localhost:3000> on your computer.

## Podman

Same file, rootless-friendly (ports 3000/8080 are unprivileged):

```shell
podman compose up -d        # if you have the compose provider set up
# or
podman-compose up -d
```

For automatic restarts of `kiwix` after downloads, enable the rootless
podman socket and point the frontend at it:

```shell
systemctl --user enable --now podman.socket
```

then start the stack with the socket path set:

```shell
CONTAINER_SOCKET="$XDG_RUNTIME_DIR/podman/podman.sock" podman compose up -d
```

Without it, the frontend falls back to telling you to run
`podman compose restart kiwix` (or `podman-compose restart kiwix`) after
downloads.

## Apple `container` (macOS)

Apple's container tool has no compose support, so run the two containers
manually. (These commands follow the documented `container` CLI syntax but
are untested — check `container run --help` on your system.)

```shell
# shared volume directory
mkdir -p "$PWD/zims"

# 1. kiwix-serve
container run -d --name kiwix -p 8080:8080 -v "$PWD/zims:/zims" \
  ghcr.io/kiwix/kiwix-tools:latest \
  /bin/sh -c 'until ls /zims/*.zim >/dev/null 2>&1; do sleep 5; done; \
              exec kiwix-serve --port 8080 /zims/*.zim'

# 2. frontend (build the local image first)
container build --tag kiwix-frontend ./frontend
container run -d --name kiwix-frontend -p 127.0.0.1:3000:3000 -v "$PWD/zims:/zims" \
  -e ZIMDIR=/zims kiwix-frontend
```

After downloads finish, restart the server container so it picks up new ZIMs
(the in-page restart button won't work here since no runtime socket is
mounted):

```shell
container stop kiwix && container start kiwix
```

## Adding ZIMs without the frontend

You can always drop any `.zim` file into `./zims` yourself (e.g. from
<https://download.kiwix.org/zim/>) and then restart the kiwix container.

## Layout

- `compose.yaml` — the whole stack
- `frontend/Dockerfile`, `frontend/server.py` — the download frontend
  (single-file Python stdlib app)
- `zims/` — your ZIM files (git-ignored)
