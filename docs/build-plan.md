# Grindstone — Build Plan

## Context

You want a self-hosted, open-sourceable game progression tracker for gacha games, initially populated for *Neverness to Everness* but architected so new games can be added later without touching shared code. A full 30-screen dark-UI mockup ("Gacha Tracker.dc.html") already exists in Claude Design and has been pulled into this repo at `design/Gacha Tracker.dc.html` for reference during the build. You asked for a staged build plan — master data first, everything else in an order I propose — with a stop-and-verify checkpoint after each stage. No git actions will be taken unless you explicitly ask.

## What the mockup actually specifies (source of truth for UI work)

30 screens total, dark theme (`#07080b` background, amber `#f0b44a` / pink `#e8639b` / green `#5fd08a` / blue `#58b7f0` / purple `#a084f5` accents, IBM Plex + Chakra Petch fonts), left icon rail (Today / Roster / Plan / Calendar / Wishlist / Data), tabbed content per section. Grouped by parent screen, with each screen's own sub-tabs/views as sibling numbers:

1. **Today** (01, +12 Dailies, +13 Weeklies) — stamina, dailies/weeklies checklists (points/progress/stamina-cost/streak columns, "at risk before reset" stamina-shortfall warning, week-over-week completion chart, monthly battle-pass tracker), ending-soon banners with pull "runway", events-expiring table, pinned roster build-progress rollup, pity summary, last pulls, redeem codes.
2. **Character detail** (02 Build, +14 Kit, +15 Materials, +16 Teams) — build-completion ring (levels/modules/skills/arc weighted); **Kit**: abilities table (multiplier/cost/cooldown), sigil/resonance unlock list, computed stats, personal rotation notes; **Materials**: per-character stock-vs-need-vs-short table grouped by ascension/skills/modules with a bottleneck callout, "shared with" (other characters needing the same mats), queue-to-farm-route action; **Teams**: saved team cards (build%, weak-link member, elements, usage stats), a "planned" team blocked on an unowned wishlist target, slot-candidate suggestions, where-each-team-is-used list.
3. **Resource planner** (03 Currency, +17 Materials, +18 Farm route, +19 Income) — currency cards w/ 30-day projection; **Materials**: global stock-vs-need table across all pinned builds with tier/gate columns (weekly-capped materials flagged as the binding constraint), summary tiles (short count, runs-to-clear, weekly-capped count, all-builds-done ETA); **Farm route**: drag-to-reorder today's stage list solved for biggest shortfalls first, a 7-day route-planning grid, stamina budget breakdown, personal drop-rate log (beats stated averages), route rules (weekly-capped-first, no-overflow); **Income sources**: toggleable per-source table (cadence/reliability/share of total) grouped Guaranteed/Event-dependent/Speculative, income mix chart, "if you drop the pass" what-if, projection-accuracy tracker.
4. **Calendar** (04 Timeline, +20 List, +21 Month grid) — three views of the same banner/event data: 6-week Gantt with today-marker and legend (solid=new, striped=rerun, diamond=pull target); a flat list grouped by "ends this week / live / upcoming" with progress + reward columns; a month grid with day-cell event chips and a "the pivot" callout for the next multi-event turnover date. Shared rail: "my deadlines", next-patch countdown, month totals.
5. **Wishlist** (05 Targets, +22 Savings rules, +23 Pull history) — priority-ordered pull targets with affordability %, runway bar, "the call" advisor verdict; **Savings rules**: ordered rule list (WHEN condition / THRESHOLD / THEN block-or-warn), a rule builder, live "what the rules say today" verdict with one-time override, an override log; **Pull history** (wishlist-scoped, distinct from screen 07's raw log): per-target outcome table (budgeted vs. spent vs. pity vs. 50/50 vs. obtained/expired/deferred), hit-rate stats, budget-vs-actual bars, "why targets expired" note.
6. **Roster grid** (06) — filter rail (element/rank/build-state/sort), character cards with build-ring badge, collection summary bar, not-owned placeholders.
7. **Pull history** (07, raw log) — pity-spent-per-S-rank chart, full pull log table, rates panel, 50/50 W/L strip, spend-by-banner, import/sync status.
8. **Character edit mode** (08) — inline steppers for level/ascension/sigil, drag-or-type skill sliders, module-slot picker, unsaved-changes panel with live ring recompute, inventory-deduct-on-save toggle, conflict warning (module equipped elsewhere).
9. **Add/entry dialogs** (09) — add wishlist target, log pull manually, new custom task, quick-add detected character, remove-from-wishlist confirm (with re-run runway preview), inventory quick-edit grid.
10. **Master data editor** (10 Characters, +24 Arcs, +25 Materials, +26 Skills, +27 Modules, +28 Elements, +29 Banners, +30 Events) — one shared table shell (game switcher, filter bar, source badges AUTO/MANUAL/OVERRIDE, incomplete-row warnings, CSV import/export, bulk edit, save bar) with **entity-specific columns**:
   - Characters (10): rank, element, role, arc-type, release date, ascension material.
   - Arcs/weapons (24): rank, type, main stat, passive text.
   - Materials (25): tier, category, drops-from, weekly cap, crafts-into.
   - Skills (26): owner (character), slot, max level, scales-with stat, material, effect text — flat table of child rows, not nested.
   - Modules/echoes (27): set, slot, main stat, max level, set bonus.
   - Elements (28): colour, short code, strong-vs (other element), characters count, linked ascension material.
   - Banners (29): type, featured entity, start/end, pity, soft-pity, 50/50 flag, carries-pity-across flag.
   - Events (30): kind, start/end, stage count, currency reward, material rewards, notes.
11. **Record editor** (11) — full-record drawer over the table: image upload (icon + splash, drag-drop, dimension hints), validation checklist, core fields, child-row editors for skills, linked ascension materials, change history, draft/publish states.

One thing the written spec calls for that isn't in the mockup and will need its own (unmocked) screen later: the **real-money spending tracker** (screen 22's rule builder references a "monthly spend ceiling" rule and screen 09 implies real-money exists, but there's no dedicated spend page). I'll design it to match the established visual system when its stage comes up rather than guessing now.

## Tech stack

- **Monorepo**: pnpm workspaces. `apps/web` (frontend), `apps/api` (backend), `packages/shared` (TS types/schemas shared by both), `games/` (per-game data + config, see below), `docs/`.
- **Backend**: Node.js + TypeScript, Fastify, Drizzle ORM.
- **Database**: SQLite (via `better-sqlite3`), file stored in a mounted `data/` volume — one file to back up, no separate DB service to run. Matches the Docker/Proxmox CT hosting requirement with the least ops overhead. Schema written so a future move to Postgres (multi-user, if ever wanted) is a Drizzle dialect swap, not a rewrite.
- **Frontend**: React + TypeScript + Vite, TanStack Query (server state) + TanStack Table (master data grid, roster table view), Tailwind CSS (utility classes map cleanly onto the mockup's inline-style system; theme tokens — the color/font values above — become Tailwind theme extensions/CSS variables so both light structural code and the dark palette stay centralized).
- **Images**: served from a local `data/images/<game-slug>/<entity-type>/<kebab-case-slug>.<ext>` path. Lookup is case-insensitive and extension-flexible (checks `.webp`, `.png`, `.jpg`, `.jpeg`, `avif` in that order). Upload endpoint writes to the canonical path for that entity (derived from its slug), overwriting if present. No picture → frontend renders the dashed placeholder box already established in the mockup (screens 02, 05, 06, 11).
- **Packaging**: multi-stage Dockerfile producing one image (API serves the built frontend static files + SQLite file in a volume); `docker-compose.yml` for local/Proxmox CT use; plain `pnpm build && pnpm start` documented as the non-Docker path.

## Repo layout & the common/game-specific split

```
apps/api/src/
  core/          # entity CRUD, build-progress math, pity engine, resource projections — game-agnostic
  routes/
  db/            # drizzle schema + migrations (schema is shared; rows carry a game_id)
apps/web/src/
  features/      # today/, roster/, wishlist/, calendar/, planner/, pull-log/, master-data/ — game-agnostic UI
  components/    # shared design-system pieces (cards, tables, badges, steppers, modals)
games/
  neverness-to-everness/
    config.ts    # display names for editable terms (arc↔weapon, module↔echo, sigil↔resonance chain, etc.), currency names, element list, rank tiers
    seed/        # initial master-data seed (characters, arcs, materials...) as JSON, loaded on first run
    connectors/  # optional online-sync adapters for this game (stage 10+)
    CLAUDE.md    # what's game-specific here and how to extend it — nothing about apps/* internals
    progress.md  # game-specific decision log, isolated from root docs/progress.md
  _template/     # skeleton + README for adding a new game (mirrors the layout above)
docs/
  build-plan.md  # this plan, kept in the repo (see "Keeping context manageable" below)
  progress.md    # running stage-by-stage status log
  adding-a-game.md
  architecture.md
CLAUDE.md        # root: project summary, tech stack, repo map, pointers to docs/ — see below
apps/api/CLAUDE.md   # backend-local conventions (routes, drizzle schema patterns, core/ math modules)
apps/web/CLAUDE.md   # frontend-local conventions (feature folder pattern, shared components, theme tokens)
```

The rule of thumb: anything that reads/writes `games/<slug>/config.ts` terminology or `games/<slug>/connectors/*` is game-specific; everything under `apps/*` operates on generic entities (`character`, `equipment_item`, `resource`, `banner`, ...) and never hardcodes N2E terms. N2E-specific labels (Arc, Sigil, Console Module, Fons, Annulith...) live only in that game's config and its seed data — the schema field names stay generic (`weapon`, `resonance_level`, `equipment_slot`, `currency`).

## Keeping context manageable across a long build

This is a big, many-session project, so Stage 0 also sets up the scaffolding that keeps a fresh Claude Code session productive without re-reading the whole codebase or re-deriving decisions already made:
- **`docs/build-plan.md`** — this plan file, copied into the repo verbatim once approved, so it's version-controlled alongside the code it describes (the source at `~/.claude/plans/starry-churning-balloon.md` is local to this machine/session and not part of the repo).
- **`docs/progress.md`** — a short running log, updated at the end of every stage: what shipped, what got deferred or changed from the plan, and any decision made along the way that isn't obvious from the code. A new session reads this first to know exactly where the build stands.
- **Root `CLAUDE.md`** — project summary, tech stack, repo map, and pointers to `docs/build-plan.md`, `docs/progress.md`, and `docs/architecture.md`. Kept short; it's a map, not a copy of the docs it points to.
- **Scoped `CLAUDE.md` files** — `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md` hold conventions local to that half of the stack (routing/schema patterns; feature-folder/component patterns), and each `games/<slug>/CLAUDE.md` holds only what's specific to that game. This mirrors the common/game-specific split itself: working inside `apps/web/features/roster/` should only need `apps/web/CLAUDE.md`, not the full game config, and vice versa.
- **Per-game context isolation** — each `games/<slug>/` directory also gets its own `progress.md`, separate from the root one. Game knowledge (character/item names, currency values, banner mechanics, seed-data sourcing decisions, connector quirks) lives only in that game's directory, never in root `docs/`. Root `docs/progress.md` stays for cross-cutting/architectural stage progress. The point: a session working on one game's data should never need to read another game's files, or root docs bloated with a specific game's trivia, to do its job. `docs/adding-a-game.md` (Stage 11) codifies this as a requirement for every new game directory, not just N2E's.
- I'll update `docs/progress.md` (and the relevant `CLAUDE.md`, if structure changed) as part of every stage's own deliverable, not as a separate cleanup task — so it never drifts far out of date. Game-specific parts of that update go to the game's own `progress.md` instead.

## Data model (drives Stage 1)

Core tables, all scoped by `game_id` and carrying `source` (`auto` / `manual` / `override`), `updated_at`, `updated_by`, `status` (`draft` / `published` — screen 11's draft/publish flow):
- `characters` (rank, element_id, role, arc_type, release_date, ascension_material_id)
- `equipment_items` / arcs (rank, type, main_stat, passive_text)
- `materials` (tier, category, drops_from, weekly_cap, crafts_into_id)
- `skills` (child of character: slot, max_level, scales_with, material_id, effect_text)
- `modules` / echoes (set, slot, main_stat, max_level, set_bonus_text)
- `elements` (colour, short_code, strong_vs_element_id, ascension_material_id)
- `banners` (type, featured_id, start, end, pity, soft_pity, fifty_fifty, carries_pity)
- `events` (kind, start, end, stage_count, currency_reward, material_rewards, notes)
- `currencies`.
- User-state tables (later stages, but foreign-keyed against the above from day one): `owned_characters`, `character_builds`, `inventory`, `pull_log`, `wishlist_targets`, `savings_rules` (ordered: when/threshold/then + an override log), `daily_tasks`/`task_log`, `spend_log`, `teams` (+ `team_members`), `farm_routes` (+ ordered `farm_route_stages`), `income_sources` (cadence, per-event amount, reliability, on/off toggle).

This `source` provenance field is what powers the AUTO/MANUAL/OVERRIDE badges and the "next auto-sync in 4h, overrides preserved" behavior shown in screen 10 — it needs to exist from Stage 1 even though the sync engine itself doesn't land until Stage 10.

## Staged build plan

Each stage ends with something runnable in the browser for you to check before I continue. I will not start a stage until you say go.

**Stage 0 — Scaffolding.** pnpm monorepo, Fastify skeleton with health check, Vite React app with routing shell + left icon rail + dark theme tokens (no real data yet), Drizzle+SQLite wired up, Dockerfile + compose, `games/neverness-to-everness/config.ts` stub. Also: copy this plan to `docs/build-plan.md`, start `docs/progress.md` with a "Stage 0 done" entry, write the root `CLAUDE.md` and the `apps/api`/`apps/web` scoped `CLAUDE.md` files (see "Keeping context manageable" above). *Check: app boots locally and in Docker, empty shell renders in the mockup's visual style, and the CLAUDE.md files accurately describe the (still-empty) structure.*

**Stage 1 — Master data (screens 10, 11, 24–30).** Schema + CRUD API for all 8 entities: characters, arcs/equipment, materials, skills, modules, elements, banners, events — each with its own column set (see Data model above). Shared master-data table UI (per-entity tabs, filter/search bar, source badges, bulk select, incomplete-row warnings, CSV import/export) built once and driven by an entity-column config, not duplicated per tab. Record editor drawer (fields, image upload with the path/placeholder convention, child-row editors — skills as a character's child rows, linked ascension materials — validation, draft/publish). Seed N2E with a small real dataset (a handful of characters/arcs/materials/banners/events, enough to exercise every column) rather than the mockup's placeholder names. *Check: you can add/edit/delete rows in every entity tab and upload images end-to-end.*

**Stage 2 — Roster & character builds (screens 02, 06, 08, 14, 15, 16).** Ownership + build state (levels, ascension, sigil/resonance, equipped modules per slot, skill levels, equipped arc/weapon), the weighted build-completion ring calculation, roster grid with filters, character detail Build/Kit/Materials/Teams tabs, and edit mode (steppers, unsaved-changes panel, inventory-deduct-on-save, slot-conflict warning). Kit tab (computed stats from equipped modules, sigil/resonance unlock list, personal rotation notes). Per-character Materials tab (stock-vs-need-vs-short breakdown, bottleneck callout, "shared with" cross-character view, queue-to-farm-route action — this previews Stage 3's farm route before it fully exists, so keep the "add to route" action as a stub that Stage 3 wires up). Teams (team CRUD, member picker, weak-link/build% computation, planned team blocked on a wishlist target — the wishlist link itself is a stub until Stage 7). *Check: mark a character owned, build it up, watch the ring, roster grid, and Kit/Materials/Teams tabs update.*

**Stage 3 — Inventory, currency & resource planner (screens 03, 17, 18, 19).** Inventory/currency ledger, manual adjust + quick-edit grid. Materials tab: global stock-vs-need-vs-short table across all pinned builds (tier/gate columns, weekly-capped items flagged as binding constraints) — wires up Stage 2's "add to farm route" stub. Farm route tab: drag-to-reorder stage list solved for biggest shortfalls first, 7-day route grid, stamina budget breakdown, personal drop-rate log, route rules. Income sources tab: toggleable per-source table (cadence/reliability), mix chart, what-if projection — manual entries for now, auto-sync is Stage 10. *Check: planner reflects real gaps from Stage 2 builds; reordering the farm route changes projected days-to-complete.*

**Stage 4 — Pull log & pity engine (screens 07, part of 09).** Manual pull entry dialog, CSV import, pity/guarantee/50-50 tracking per banner type, rates/luckiest/worst stats, spend-by-banner. *Check: log pulls, see pity and stats compute correctly.*

**Stage 5 — Today dashboard (screens 01, 12, 13).** Stamina tracker, dailies checklist (with custom task dialog), weeklies checklist (with monthly battle-pass progress, "at risk before reset" stamina-shortfall warning, week-over-week chart), banner "ending soon" + runway pulling from Stage 4's pity state, events-expiring, roster rollup, redeem codes list, last-pulls widget. This is the aggregation screen — it should mostly wire together data from Stages 1-4. *Check: dashboard reads live from everything built so far.*

**Stage 6 — Calendar (screens 04, 20, 21).** Banner/event Gantt timeline, list view (grouped by ends-this-week/live/upcoming), month grid view — three presentations of one dataset, so build the data layer once and swap renderers. Deadlines rail, patch countdown, "the pivot" next-turnover callout. *Check: banners/events from master data render correctly in all three views with a consistent today-marker.*

**Stage 7 — Wishlist & savings rules (screens 05, 22, 23, remaining dialogs in 09).** Priority targets, affordability calc, "the call" advisor (skip/save/pull logic against pity + resource planner + calendar dates), lock-plan/simulate actions, lifetime stats, remove-target confirmation with re-run preview — resolves Stage 2's planned-team stub. Savings rules tab: ordered rule list (when/threshold/then block-or-warn), rule builder, live verdict with one-time override, override log. Pull history tab (wishlist-scoped): per-target outcome table, hit-rate stats, budget-vs-actual, why-targets-expired note. *Check: adding/reordering targets changes affordability verdicts; a savings rule actually blocks/warns on a matching pull.*

**Stage 8 — Dialog/UX polish pass.** Consolidate the add-dialogs pattern used across earlier stages (screen 09's remaining dialogs: quick-add detected character, inventory quick-edit), general responsive/empty-state pass. *Check: dialogs behave consistently across every feature area.*

**Stage 9 — Real-money spend tracker (unmocked).** Per-game + global spend log, category breakdown (cosmetics/subscriptions/etc.), totals — new page designed to match the established visual system. *Check: log a purchase, see totals roll up per-game and globally.*

**Stage 10 — Online data sync connectors.** Per-game `connectors/` adapters (e.g., parse an official update RSS/JSON feed) that write into the `auto` source rows on a schedule or manual "sync now", leaving `manual`/`override` rows untouched — the provenance system from Stage 1 already supports this. Ship one real N2E connector if a stable feed is identified; otherwise ship the framework + a mock connector and document the interface. *Check: trigger a sync, see AUTO rows update, MANUAL rows survive.*

**Stage 11 — New-game onboarding docs.** `docs/adding-a-game.md` walking through everything a new `games/<slug>/` needs (config terminology map, seed format, optional connectors), validated by filling out `games/_template/`. *Check: docs are enough to add a second (even fake) game without touching `apps/*`.*

**Stage 12 — Deployment hardening.** Final Dockerfile/compose review, Proxmox CT install doc, backup/restore doc (copy the SQLite file + images dir), basic auth/access note if wanted before open-sourcing.

## Verification approach

After each stage: `pnpm dev` (or `docker compose up`), walk the relevant screen(s) in a browser against the mockup for visual parity, exercise the CRUD path that stage introduced, and I'll flag anything that couldn't be tested through the UI directly (e.g., cron-based sync timing in Stage 10). I'll also append a `docs/progress.md` entry for the stage (what shipped, what changed from plan, notable decisions) and touch up any `CLAUDE.md` whose described structure moved, before handing it back for your check.
