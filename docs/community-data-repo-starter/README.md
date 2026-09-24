# Grindstone community data

Community-maintained update data — new banners, events, redeem codes, and level-up material costs — for games tracked by [Grindstone](../../). This repo exists because no game Grindstone tracks publishes a stable official feed for this information (confirmed by research — see the main repo's `docs/progress.md` and each game's own `progress.md` for what was checked and found). Instead of every install re-deriving the same fact from patch notes, this repo is the one shared place that work happens.

## How it works

Each Grindstone install periodically checks this repo for files it hasn't seen yet, for whichever games it tracks, and applies them locally. A file only ever *creates or updates* rows it originally created (`source: "auto"`) — it never touches anything you added or edited yourself in your own install. See the main repo's `docs/progress.md` Stage 10 entry for the full design.

## Layout

```
games/<game-slug>/codes/<ISO-date>-<short-slug>.json
games/<game-slug>/banners/<ISO-date>-<short-slug>.json
games/<game-slug>/events/<ISO-date>-<short-slug>.json
games/<game-slug>/level-costs/<ISO-date>-<target-kind>-<target-slug>.json
```

- `<game-slug>` matches the slug Grindstone uses for that game (e.g. `neverness-to-everness`).
- One file per discrete update event — a livestream dropping three codes at once is still one file (an array inside it), not three. This keeps concurrent PRs from ever conflicting with each other and keeps "what's new since I last checked" a simple filename comparison.
- `<ISO-date>` is the date you're adding the entry (not necessarily the date the update goes live — `startDate`/`endDate` inside the file cover that). `<short-slug>` is a few words identifying the event, lowercase, hyphenated.

## Contributing

1. Fork, add one new file in the right `games/<slug>/<type>/` folder, following [`schema.md`](./schema.md) for that type's exact shape.
2. Open a PR. CI validates the file's structure automatically — fix anything it flags before requesting review.
3. If someone else already opened a PR for the same update, a maintainer will close the duplicate — no need to check yourself first.

You don't need a Grindstone install to contribute — anyone who saw the update (in-game, Discord, a fan site, a livestream) can add it.

## Adding a new game

Create `games/<new-slug>/` with the same four subfolders. Nothing else to register — Grindstone installs only ever look for `games/<slug>/` matching a game they've configured, so an empty or nonexistent folder for a game they don't track is simply never fetched.
