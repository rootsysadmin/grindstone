# games/neverness-to-everness

Everything specific to this one game. See root `CLAUDE.md` for why this split exists — nothing in `apps/*` should need to be read alongside this file; if it does, something's leaking across the boundary.

## Layout

```
config.ts     # terminology map (equipmentItem->"Arc", augment->"Console Module",
              # resonanceLevel->"Sigil", ...), currency list, rank tiers, brand name
seed/          # initial master-data rows (characters, arcs, materials, banners,
              # events...) loaded on first run — added in Stage 1
progress.md    # game-specific decision log — see note below
```

No `connectors/` directory — Stage 10 found no stable official feed to connect to for this game (see `progress.md`), and the design that shipped instead pulls from a separate, external community data repo (not anything living locally under `games/<slug>/`) rather than a local per-game connector file. See root `docs/progress.md`'s Stage 10 entry and `docs/community-data-repo-starter/` for that design.

## Context isolation

This directory is the *entire* context a session needs for anything N2E-specific — game knowledge (character names, currency values, banner mechanics, seed data provenance) stays here, not in root `docs/`. Read `progress.md` in this directory, not the root one, before touching seed data, `config.ts`, or connectors. When a second game is added later, its directory must be equally self-contained — a session working on game A's data should never need to load game B's files to do its job, and root `docs/` should never accumulate game-specific facts that belong in one game's directory instead.

## Conventions

- `config.ts` is the only place N2E-specific display strings live. If `apps/*` needs a label like "Arc" or "Sigil", it reads `gameConfig.terms.*` — it does not hardcode the word.
- Seed data (once added in Stage 1) uses real N2E characters/items, not the mockup's placeholder names (Zankou, Iroi, etc. were mockup filler).
- Update sync (Stage 10 — see root `docs/progress.md`) only ever writes rows with `source: "auto"`; it never overwrites a `manual`/`override` row. It pulls from a community data repo external to this codebase, configured app-wide via the Data page, not from anything under this directory.
