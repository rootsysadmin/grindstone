# apps/web

React + Vite frontend. See root `CLAUDE.md` for the project-wide picture — this file is just what's local to the frontend.

## Layout

```
src/
  App.tsx           # router setup + QueryClientProvider
  theme.css          # Tailwind entry + global element resets
  components/        # shared design-system pieces used across features (cards, tables,
                      # badges, steppers, modals, the Shell/rail)
  features/          # one folder per nav destination: today/, roster/, wishlist/,
                      # calendar/, planner/, pull-log/, master-data/ — each owns its
                      # own components, hooks, and API calls. Cross-feature reuse goes
                      # through components/, not by importing across feature folders.
```

## Conventions

- Theme tokens (colors, fonts) are Tailwind theme extensions in `tailwind.config.js` — reference them as utility classes (`bg-panel`, `text-amber`, `font-display`) rather than hardcoding hex values, so the palette stays centralized.
- Server state goes through TanStack Query (hooks colocated in the feature folder that owns the data); don't hand-roll fetch+useState for anything that hits the API.
- The mockup at `design/Gacha Tracker.dc.html` (30 screens, `data-screen-label` attributes) is the visual/behavioral source of truth — match it screen by screen as each stage builds out its feature.
- Imports use explicit `.tsx`/`.ts` extensions (see `tsconfig.json`'s `allowImportingTsExtensions`) — keep that consistent.
- No game-specific strings here — anything that should read as "Arc" for N2E needs to come from the game config via the API, not be hardcoded in a component.
