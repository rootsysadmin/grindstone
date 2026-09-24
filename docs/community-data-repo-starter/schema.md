# File schema

Every file is either one object, or a JSON array of objects (for one event dropping several items at once — e.g. a livestream with 3 codes). Every object has a `kind` field selecting its shape below. Unknown/extra fields are ignored, not rejected — but CI will reject a file missing a required field or using a value outside the listed enums.

## `codes/` — `kind: "code"`

```json
{ "kind": "code", "code": "SUMMERTIME", "rewardLabel": "100 Annulith" }
```

| field | required | notes |
|---|---|---|
| `code` | yes | exact redeem code string, case as the game expects it |
| `rewardLabel` | no | short free-text description of what it grants |

Matched on `code` — re-adding the same code in a later file updates its `rewardLabel` rather than duplicating it, as long as nobody's install has hand-edited that code locally (see the main repo's provenance rules).

## `banners/` — `kind: "banner"`

```json
{
  "kind": "banner",
  "name": "Alluring Shadows",
  "type": "Character",
  "startDate": "2026-09-19",
  "endDate": "2026-10-09"
}
```

| field | required | notes |
|---|---|---|
| `name` | yes | banner's display name — this is also what it's matched on (as a slug derived from the name) |
| `type` | no | free text, matches whatever category the game's own banner list uses |
| `startDate` / `endDate` | no | `YYYY-MM-DD` |

Featured character/weapon isn't supported by CI-checkable data yet (it needs matching against a specific game's roster, which this repo doesn't have) — leave it out; it can be filled in locally after a sync, or added by hand.

## `events/` — `kind: "event"`

```json
{
  "kind": "event",
  "name": "Circle Bounty",
  "startDate": "2026-09-19",
  "endDate": "2026-10-03",
  "notes": "140 Annulith on completion"
}
```

| field | required | notes |
|---|---|---|
| `name` | yes | event's display name — matched on as a slug derived from the name |
| `startDate` / `endDate` | no | `YYYY-MM-DD` |
| `notes` | no | free text — reward summary, mechanic notes, whatever's useful |

## `level-costs/` — `kind: "level-costs"`

Attaches level-up material costs to a character, weapon, or skill that **already exists** in a Grindstone install's master data — this never creates the target itself (a new character/weapon comes from a `banners/` file's `newCharacter`/`newEquipment` instead, see below).

```json
{
  "kind": "level-costs",
  "targetKind": "character",
  "targetSlug": "some-character",
  "newMaterials": [{ "name": "Some New Material", "category": "ascension" }],
  "bands": [
    { "fromLevel": 1, "toLevel": 20, "materialSlug": "some-new-material", "quantity": 12 },
    { "fromLevel": 1, "toLevel": 20, "materialSlug": "an-existing-material", "quantity": 4000 },
    { "fromLevel": 1, "toLevel": 20, "kind": "exp", "expAmount": 46000 }
  ]
}
```

| field | required | notes |
|---|---|---|
| `targetKind` | yes | one of `character`, `equipment`, `skill` |
| `targetSlug` | yes | slug of the character/weapon/skill this attaches to — if nothing in an install matches, the whole file is skipped for that install (it's never used to create the target) |
| `newMaterials` | no | materials this update introduces that don't exist yet — each needs `name`; `category` is optional. Rank tier isn't set here — it's a per-game custom table now, filled in by hand afterward like any other newly-added master-data fact |
| `bands` | yes, non-empty | each band is one of two kinds, sharing `fromLevel`/`toLevel`: a **material** band (`kind` omitted or `"material"`) needs `materialSlug` + `quantity` — `materialSlug` can reference either an existing material or one listed in `newMaterials` (match it to `newMaterials[].name` turned into a slug, e.g. "Some New Material" → `some-new-material`); an **EXP** band (`kind: "exp"`) needs `expAmount` instead — a flat EXP requirement fillable by any combination of that entity's EXP-flagged materials, not one specific item. EXP bands are only meaningful for `targetKind: "character"`/`"equipment"` — an EXP band targeting a skill is dropped, skill leveling stays material-only |

Matched per-band, not per-file: an install re-syncing the same file later updates just the bands whose numbers changed, and never touches a band you've hand-corrected locally — see the main repo's provenance rules. A material band matches by (target, fromLevel, toLevel, material); an EXP band matches by (target, fromLevel, toLevel, kind) instead, since it has no specific material to key on.
