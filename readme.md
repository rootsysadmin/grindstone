# Grindstone

Self-hosted progression tracker for gacha games to track your roster, gear, resources, and banner pulls against per-item level/upgrade costs. Built to be **game-agnostic**: all game-specific data (character names, currencies, banners) lives under `games/<slug>/`.

Currently seeded games: `neverness-to-everness`, `wuthering-waves`.

## Tech stack

- Monorepo: pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`)
- Backend: Node.js + TypeScript, Fastify, Drizzle ORM, SQLite (`better-sqlite3`)
- Frontend: React + TypeScript + Vite, TanStack Query/Table, Tailwind CSS

## Requirements

- Node.js >= 20
- pnpm (via `corepack enable`)

## Quick start (development)

```
pnpm install
pnpm dev            # api (:3001) + web (:5173), web proxies /api and /images to the api
```

Other useful scripts:

```
pnpm dev:api         # api only
pnpm dev:web         # web only
pnpm typecheck       # all workspaces
pnpm build           # production build (shared -> api -> web)
pnpm db:migrate      # apply pending Drizzle migrations
pnpm db:seed         # load a game's seed data
```

## Running in production

Build once, then run the API (it serves the built web app too):

```
pnpm build
pnpm start
```

Environment variables (all optional, sensible defaults shown):

| Variable   | Default                    | Purpose                              |
|------------|-----------------------------|---------------------------------------|
| `PORT`     | `3001`                      | HTTP port                             |
| `GAME`     | `neverness-to-everness`     | Which `games/<slug>/` config to load  |
| `DATA_DIR` | `./data`                    | SQLite file + uploaded images         |

### Docker

```
docker compose up -d --build
```

See [docker-compose.yml](docker-compose.yml) / [Dockerfile](Dockerfile) — data persists in the `grindstone-data` volume.

### Proxmox LXC

`scripts/ct/grindstone.sh` (run on the Proxmox host) provisions a fresh unprivileged CT — interactively prompting for CTID, storage, template, network, etc. instead of assuming names you may not have — then pushes `scripts/install/grindstone-install.sh` into it, which installs Node, builds Grindstone, and runs it as a systemd service (auto-starts on CT/host boot, restarts on crash):

```
bash scripts/ct/grindstone.sh
```

Every prompt has an editable default and can be pre-filled via env var (`CTID=150 bash scripts/ct/grindstone.sh`). Root console login is passwordless (`pct console <ctid>` auto-logs in; `pct enter <ctid>` always works without one).

## Repo map

```
apps/api/         Fastify backend
apps/web/         React frontend
packages/shared/  types shared by both
games/<slug>/     per-game config + seed data (self-contained, own CLAUDE.md/progress.md)
docs/             build-plan.md, progress.md — read docs/progress.md before non-trivial changes
design/           source UI mockup, reference for visual/behavioral parity
scripts/          ops scripts (Proxmox installer, etc.)
data/             gitignored runtime data (SQLite + images)
```

## Contributing / working on this repo

See [CLAUDE.md](CLAUDE.md) for the architectural rule (game-agnostic `apps/*`), staged build process, and where different kinds of documentation belong.
