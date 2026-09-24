# apps/api

Fastify backend. See root `CLAUDE.md` for the project-wide picture — this file is just what's local to the backend.

## Layout

```
src/
  index.ts        # app entry: registers plugins, mounts routes, listens
  config.ts        # env-driven config (port, game slug, data/db/images paths)
  db/
    schema.ts       # Drizzle schema — all tables live here (or re-exported from here)
    client.ts       # sqlite connection + drizzle instance (import for its db export)
    migrate.ts       # migration runner (pnpm db:migrate)
  core/             # game-agnostic business logic: pity engine, resource projections.
                     # Pure functions where possible — keep DB access in routes/, not
                     # here, so this stays unit-testable. NOT build-progress math —
                     # that lives client-side (apps/web/src/features/roster/buildProgress.ts)
                     # since it needs each game's numeric caps from games/<slug>/config.ts,
                     # which apps/api can't cleanly import (NodeNext + a rootDir:"src"
                     # build that config.ts sits outside of) — see docs/progress.md's
                     # Stage 2 entry.
  routes/           # one file per resource, registered as Fastify plugins in index.ts
```

## Conventions

- Every table gets `game_id`, and master-data tables get `source` (`auto`/`manual`/`override`) and `status` (`draft`/`published`) columns — see `docs/build-plan.md`'s Data model section for the full column list per entity.
- Route handlers stay thin: parse/validate input, call into `core/`, shape the response. Business logic (build % calculation, pity math, resource projections) belongs in `core/` so it's shared and testable independent of HTTP.
- Config is read from `src/config.ts`, never `process.env` directly in route/business-logic code.
- Schema changes: edit `src/db/schema.ts`, run `pnpm db:generate` (from repo root or this dir) to produce a migration under `drizzle/`, then `pnpm db:migrate` to apply it.
- Image uploads write to `config.imagesDir` following the path convention in root `CLAUDE.md` — never store images in the DB.
