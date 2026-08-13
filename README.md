# dockerized-kiwix-server

A Docker Compose stack combining a **Kiwix Server** backend with a modern **SolidStart 2** frontend for browsing, downloading, and managing offline ZIM knowledge packages from Zimfarm.

## Features

- 📦 **Zimfarm OPDS Catalog Explorer**: Search and filter over 3,600+ offline ZIM archives (Wikipedia, DevDocs, Stack Overflow, Gutenberg, TED, etc.) by language and category.
- ⚡ **One-Click ZIM Installation**: Download ZIM packages directly into the shared `./zims` volume with real-time speed, percentage, and progress tracking.
- 💾 **Local ZIM Library Management**: View installed ZIM files, inspect disk usage, and delete unwanted archives.
- 📖 **Embedded Kiwix Reader**: Launch and read Kiwix offline content directly in the frontend or at `http://localhost:8080`.
- 🐳 **Docker Compose Ready**: Multi-container setup orchestrating `kiwix-serve` and the `frontend`.

---

## Quick Start (Docker Compose)

### 1. Clone & Start the Stack

```shell
git clone https://github.com/jonboiser/dockerized-kiwix-server.git
cd dockerized-kiwix-server

# Start Kiwix Server + SolidStart Frontend
docker compose up -d
```

### 2. Access the Applications

- **SolidStart Frontend (Zimfarm Studio):** [http://localhost:3000](http://localhost:3000)
- **Kiwix Server Reader:** [http://localhost:8080](http://localhost:8080)

---

## Local Development (Frontend)

To work on the SolidStart 2 frontend locally without Docker:

```shell
cd frontend
npm install
npm run dev
```

The frontend will run at `http://localhost:3000` and default to saving downloads into `../zims`.

---

## Service Architecture

```
┌─────────────────────────────────┐       ┌──────────────────────────────────┐
│ SolidStart 2 Frontend (3000)    │       │ Kiwix Server (8080)              │
│ - Zimfarm OPDS Catalog Explorer │       │ - Serves /zims/*.zim             │
│ - Download Manager              │       │ - Auto-generates library.xml     │
└────────────────┬────────────────┘       └────────────────┬─────────────────┘
                 │                                         │
                 └───────────────────┬─────────────────────┘
                                     │
                             Shared Volume
                             ./zims:/zims
```
