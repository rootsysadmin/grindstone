# Grindstone

Self-hosted game progression tracker for gacha games. Initial game is *Neverness to Everness*; the codebase is architected so other games can be added without touching shared code (see `docs/adding-a-game.md`, once it exists — Stage 11).

**Before doing any non-trivial work here, read `docs/progress.md` first** — it says exactly what stage the build is at and what's already decided. `docs/build-plan.md` has the full staged plan; `docs/architecture.md` (once it exists) has deeper design rationale. Don't re-derive decisions already recorded in those files.

## Tech stack

- Monorepo: pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`).
- Backend: Node.js + TypeScript, Fastify, Drizzle ORM, SQLite (`better-sqlite3`).
- Frontend: React + TypeScript + Vite, TanStack Query + TanStack Table, Tailwind CSS.
- Images: local filesystem at `data/images/<game-slug>/<entity-type>/<kebab-case-slug>.<ext>`, case-insensitive/extension-flexible lookup.
- Packaging: single multi-stage `Dockerfile` + `docker-compose.yml`; also runnable directly via `pnpm build && pnpm start`.

## Repo map

```
apps/api/     — Fastify backend. See apps/api/CLAUDE.md.
apps/web/     — React frontend. See apps/web/CLAUDE.md.
packages/shared/ — types shared by both.
games/<slug>/ — per-game config, seed data, optional sync connectors. Never referenced by name from apps/*.
docs/         — build-plan.md, progress.md, architecture.md, adding-a-game.md.
design/       — the source UI mockup (Gacha Tracker.dc.html, 30 screens). Reference for visual/behavioral parity.
data/         — gitignored runtime data: SQLite file + uploaded images.
```

## The one rule that matters most

Code under `apps/*` is **game-agnostic**. It operates on generic entities (`character`, `equipment_item`, `resource`, `banner`...) and never hardcodes a game's terminology, currency names, or identity. Anything specific to Neverness to Everness — "Arc" instead of "weapon", "Sigil" instead of "resonance level", currency names like Annulith/Fons — lives only in `games/neverness-to-everness/config.ts` and its seed data. If you're about to write an N2E-specific string into `apps/*`, stop and route it through the game config instead.

This cuts both ways for context, not just code: each `games/<slug>/` directory (config, seed, connectors, and its own `CLAUDE.md`/`progress.md`) is meant to be a self-contained unit a session can read on its own — game knowledge (character names, currency values, banner mechanics, seed sourcing decisions) belongs there, never in root `docs/`. When working on game-specific data, read that game's own `CLAUDE.md` and `progress.md` instead of pulling in root docs unnecessarily; when a second game gets added, its directory should be just as self-contained, with nothing about it forced into root `docs/` or into another game's directory.

## Commands

```
pnpm install        # once, or after adding a dependency
pnpm dev             # both apps/api and apps/web
pnpm dev:api         # api only, :3001
pnpm dev:web         # web only, :5173 (proxies /api and /images to :3001)
pnpm typecheck       # all workspaces
pnpm build           # production build (shared -> api -> web)
```

## Working practice on this repo

Building in stages per `docs/build-plan.md`, with a stop-and-verify checkpoint after each stage — don't start the next stage without it being asked for. Update `docs/progress.md` at the end of each stage for cross-cutting/architectural progress; route anything game-specific (seed data decisions, connector quirks) to that game's own `games/<slug>/progress.md` instead — see "Context isolation" above. Never touch git (commit/push/pull) unless explicitly asked.


## Other
Keep the app running after each stage for manual testing/verification