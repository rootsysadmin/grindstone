# games/wuthering-waves

Everything specific to this one game. See root `CLAUDE.md` for why this split exists — nothing in `apps/*` should need to be read alongside this file; if it does, something's leaking across the boundary.

## Layout

```
config.ts     # terminology map (equipmentItem->"Weapon", augment->"Echo",
              # resonanceLevel->"Resonance Chain", ...), currency list, rank tiers
seed/          # initial master-data rows — deliberately small (5 characters, 3
              # weapons, 3 materials, 3 Echo/Sonata sets, 1 banner, 1 event), added
              # to pressure-test the shared schema, not to be a real WuWa tracker
progress.md    # game-specific decision log, sourcing notes, and the schema-fit
              # gaps this game's real mechanics surfaced — see below
```

No `connectors/` yet (Stage 10 feature, not built for any game).

## Context isolation

This directory is the *entire* context a session needs for anything WuWa-specific. Read `progress.md` in this directory, not the root one, before touching seed data or `config.ts`.

## Conventions

- `config.ts` is the only place WuWa-specific display strings live. If `apps/*` needs a label like "Weapon" or "Echo", it reads `gameConfig.terms.*` — it does not hardcode the word.
- This game's seed data is intentionally minimal — see `progress.md` for why (it exists to test genericness, not to be feature-complete) and what real WuWa mechanics don't fit the shared schema cleanly.
