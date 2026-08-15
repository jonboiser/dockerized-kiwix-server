# dockerized-kiwix-server

The fastest way to bootstrap a personal [Kiwix](https://kiwix.org) server: two
containers and one shared folder.

- **kiwix** — the official [`ghcr.io/kiwix/kiwix-tools`](https://github.com/kiwix/kiwix-tools/pkgs/container/kiwix-tools)
  image running `kiwix-serve`, serving every ZIM in `./zims` on port **8080**.
- **frontend** — a tiny Python image (standard library only, ~60 lines of CSS,
  **zero JavaScript**) for browsing the Kiwix catalog and downloading ZIM
  files straight into the shared volume, on port **3000**.

```
┌────────────────────────┐        ┌────────────────────────┐
│ frontend  :3000        │        │ kiwix-serve  :8080     │
│ search catalog,        │───────>│ serves /zims/*.zim     │
│ download & delete ZIMs │        │                        │
└───────────┬────────────┘        └───────────┬────────────┘
            └───────────  ./zims  ────────────┘
```

## Quick start (Docker)

```shell
git clone https://github.com/jonboiser/dockerized-kiwix-server.git
cd dockerized-kiwix-server
docker compose up -d
```

1. Open <http://localhost:3000>, search the catalog, and click **Download**.
   The page auto-refreshes while downloads run (via `<meta refresh>`, not JS).
2. Once a download completes, tell kiwix-serve to pick it up:

   ```shell
   docker compose restart kiwix
   ```

3. Open <http://localhost:8080> and start reading.

Stop everything with `docker compose down`.

> `kiwix-serve` only loads the ZIM files listed when it starts, so a
> `restart kiwix` is needed after every download or delete. The frontend
> reminds you of this on the page.

## Podman

Same file, rootless-friendly (ports 3000/8080 are unprivileged):

```shell
podman compose up -d        # if you have the compose provider set up
# or
podman-compose up -d
```

Then `podman compose restart kiwix` (or `podman-compose restart kiwix`)
after downloads, as above.

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
container run -d --name kiwix-frontend -p 3000:3000 -v "$PWD/zims:/zims" \
  -e ZIMDIR=/zims kiwix-frontend
```

After downloads finish, restart the server container so it picks up new ZIMs:

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
