# MVMap

Forked from https://github.com/TitaniumCladStudios/MVMap

A metroidvania map editor. Paint rooms onto grid paper, colour them by area, connect them with doors, and model progression with locks and keys.

Version 2 is a small Vite + TypeScript app: rooms stay on the grid, while structures, edge structures, stamps, notes and keys can be placed off the grid at an adjustable snap step. No server, no account — it runs entirely in the browser.

Built to design an unannounced metroidvania.

---

## Running it

```sh
npm install
npm run dev        # editor at http://localhost:5173
npm test           # unit tests (node --test, Node 22.18 or newer)
npm run build      # type-check and build into dist/
npm run preview    # serve the built dist/
```

The build in `dist/` is static and uses relative paths, so it can be served from any folder of any static host. It does need to be served over HTTP — browsers don't run module scripts from `file://`.

`mvmap-types.js` and `mvmap-ue.js` stay plain scripts at the repo root (they are shared with the UE importer, its node tests and `export_mvmap_stamp_icons.py`); the page loads them before the app and the build copies them next to `index.html`. The editor warns and stops working without them.

### Deploying

`.github/workflows/pages.yml` builds the site on every push to `main` and deploys it with GitHub Pages (repository **Settings → Pages → Source: GitHub Actions**). The `v1` branch keeps the single-file 1.x editor.

---

## Why locks and keys

The core metroidvania principle is that the world is non-linear and gated. New areas are *locked*, and to get through a gate the player has to go find the thing that opens it — which usually isn't a key at all. It's a movement ability, an item, or a story beat.

So the interesting part of the design isn't the level geometry. It's the dependency graph underneath it, and graph paper can't show you that. MVMap models it directly:

- A **lock** is a concept, not a door. Put the same lock on every gap in the world that the grapple opens.
- A **key** is placed where the player finds it, and is rarely a literal key.
- The relationship is many-to-many. One lock can accept several keys — that's a sequence break you designed on purpose instead of one a speedrunner found for you. One key can open many locks.
- Selecting a lock or key draws dashed arrows from each key's location to every door it opens. Toggle **Show all lock ↔ key links** to see the whole progression graph laid over the geography.
- A lock with doors but no key that opens it is flagged as a soft-lock in the inspector.

---

## Features

**World grid** — unbounded grid paper, heavy line every 8 cells. Pan, zoom to cursor, zoom to fit. HUD shows the cell under the pointer, or the snapped position for the off-grid tools.

**Snapping** — rooms and doors always sit on whole cells. Everything drawn over them (structures, edge structures, stamps, notes and keys) snaps to the step picked under **Snap** in the left panel: `1`, `½` (default), `⅓`, `¼`, `⅙`, `⅛` of a cell, or **Free**. Hold `Alt` to toggle snapping for the moment — off when a step is picked, back to the last step when it's Free; the bar outlines the step in effect. The grid draws the step's sub-lines while an off-grid tool is active. The step is stored per browser in `mvmap:snap`.

**Rooms** — painted as arbitrary cell sets, so an L-shaped shaft, a ring, or a long corridor is *one* room rather than several boxes glued together. Only the silhouette is outlined, so it reads like an in-game map. Drag a room in select mode and everything sitting on it moves too: the doors it solely owns (doors shared with a neighbouring room stay anchored), the parts of structures and edge structures inside its cells (cut at the room's border), and the stamps, notes and keys centred in it.

**Areas** — colour-coded biomes. Rooms inherit the area colour, or override it individually. The room list groups by area. Adding an area opens a room inside it immediately.

**Doors** — placed on the edge *between* cells, not in them. Three kinds: passage, door, and one-way (with a flippable direction arrow). The inspector always names the two rooms a door actually connects.

**Locks and keys** — as above.

**Structures** — a second layer of named, coloured areas painted *on top of* rooms: walls, breakable or hidden walls, switches, mechanisms. A structure is a set of axis-aligned rectangles at the snap step — at `½`, a ledge one cell wide and half a cell tall is one stroke. Draw with **S-Paint** (a square brush the size of the step, `⅛` cell while snapping is free) or **S-Rect** (drag a box: from the step square under the press to the one under the pointer, or corner to corner when free); `Ctrl` erases with either. **S-Erase** removes structure area and cuts any edge structure it passes over, without touching the room beneath. Structures never overlap: painting one over another takes that area from the other. A structure can span several rooms.

**Edge structures** — named, coloured sets of line segments, drawn as thick bars: platforms, ledges, one-way floors. With the **Edge** tool, drag from one snap point to another to lay a segment at any angle; hold `Shift` while dragging to lock it to 45° steps (`Shift` held as you press starts a new edge structure). Click a segment to select it; `Ctrl`-drag erases. Segments on one line that touch or overlap merge, and an overlap with another edge structure goes to the one drawn last; crossings are allowed.

Both kinds get their own list in the left rail, an inspector with name, colour (palette or custom picker) and notes, and can be selected and dragged with the Select tool. Clicking on the map selects only the connected *piece* under the pointer — dragging moves it (snapped) and `Del` deletes it — so the separate parts of one structure stay independent (pick the structure in its list to select every piece): rectangles connect along a side (corner contact doesn't count), and segments connect when they share any point. Toggle them with **Show structures** / **Show structure names**.

**Stamps** — emoji markers the size of one cell, drawn on top of everything: save points, items, bosses, shops. Each stamp has a name, an emoji (pick from a 64-emoji palette or type one; the field accepts exactly one emoji), a tile colour and notes, and can be placed as often as you like, at any snapped position. Click with the **Stamp** tool to place, `Shift`-click for a new stamp, `Ctrl`-click to remove; drag a placed stamp (Stamp or Select tool) to move that one copy. Two stamps can't sit at exactly the same spot — placing one there replaces the other.

**Notes** — standalone annotations the size of one cell, drawn above everything else (stamps included). Unlike areas, rooms, structures and stamps there's nothing to pick from a list — every note is its own thing. Click with the **Note** tool (`N`) to add one (it snaps like stamps; drag a note to move it) and write its details in the Inspector. The **+** button on the note (or `Enter` while selected) expands it into a translucent text box beside the cell; the box's **−** button collapses it. Drag the open box anywhere (in any tool, Pan included); it keeps that spot after collapsing and reopening, and **Reset box position** in the Inspector puts it back beside the note. The label under the note shows in both states and can be hidden with **Show name on map**. Delete with `Del`, `Ctrl`-click / right-click remove, or the Inspector; **Show notes** hides them all. Moving a room carries its notes along. (These are separate from the *notes* text field on rooms, structures and stamps.)

**Pencil** — freehand drawing on top of the map, off the grid, for sketches, arrows and quick annotations. Pick a colour (palette or custom) and a brush size in the bar that appears at the top of the map while the **Pencil** (`L`) or **P-Erase** (`Q`) tool is active. Pencil strokes don't belong to any area, room or structure, aren't picked by Select, and don't move with rooms. **P-Erase** — or `Ctrl` / right-click remove with the Pencil — rubs out pencil ink only, cutting strokes where the eraser passes; it never touches rooms, structures or anything else. **Clear all** in the bar removes every stroke (undoable). Strokes are saved with the map and included in export and PNG; **Show pencil drawings** in Options hides them.

**Hand-placed markers** — structures, edge structures and stamps the UE importer won't generate get a marker: `manual` types an orange dashed outline and a **手** badge, 未分类 ones a red dotted outline and a **?** badge. Each connected piece gets its own badge (stamps: every copy); badges hide when cells are under 8 px on screen. **Highlight hand-placed only** in Options fades everything else except rooms. PNG export shows markers and fading as on screen.

**Options** — the view toggles (lock ↔ key links, room names, structures, structure names, notes, pencil drawings, highlight hand-placed only), **Stamp labels above zoom** and **Right-click** live at the bottom of the right panel. Stamp names only appear once the map is zoomed in past the stamp-label zoom (60 % by default), so a zoomed-out map stays readable.

**Right-click** — configurable under Options. *Remove* (default) acts like holding `Ctrl` with the current tool: erase room cells or structure area, cut edge segments, delete a door, key, note or stamp; with Select it removes the smallest thing under the pointer. *Hold & drag to pan* makes it a pan button instead. Stored per browser in `mvmap:rclick`.

**Names & order** — a room's **Name position** puts its label in the centre or in one of four corners (anchored to a cell the room owns, so L-shapes keep it inside). Every inspector has a **Show name on map** toggle (on by default) and **Order** buttons that move the selection up or down its list; rooms reorder within their area. Lists draw in order, so later entries paint over earlier ones.

**Storage** — autosaves to IndexedDB (localStorage fallback) with a **Maps…** library for multiple projects. Export/import JSON, export the whole map as a PNG.

**Undo/redo** — snapshot-based, covers everything.

---

## Shortcuts

### Map

The tool keys below are the defaults. Rebind any left-panel tool under **? → Tool shortcuts**: click a key and press the new one; taking a key another tool already uses swaps the two. Modifier combinations and the reserved keys (`Space`, `F`, `Enter`, `Esc`, `Del`, `Backspace`, `[`, `]`, `Tab`) can't be bound, and holding `Space` always pans. **Export** / **Import** there save and load a `mvmap-shortcuts.json`; **Reset to defaults** restores the table below. Custom keys are stored per browser in `mvmap:keys`.

| Key | Action |
|---|---|
| `V` | Select / move |
| `B` | Paint cells |
| `R` | Rectangle fill |
| `E` | Erase cells |
| `D` | Door |
| `K` | Key |
| `S` | Structure paint |
| `T` | Structure rectangle |
| `X` | Structure erase |
| `P` | Edge structure (drag a segment) |
| `M` | Emoji stamp |
| `N` | Note |
| `L` | Pencil |
| `Q` | Pencil eraser |
| `[` / `]` | Move selection up / down its list |
| `Shift` + `[` / `]` | Move selection to top / bottom |
| `H` or hold `Space` | Pan |
| Hold `Alt` | Toggle snapping (structures, edges, stamps, notes, keys) |
| `Shift` + paint / click | Start a new room / structure / edge structure / stamp |
| `Shift` while dragging an edge | Lock the segment to 45° steps |
| `Ctrl` + paint / drag / click | Erase or remove instead (cells, structure area, edge segments, doors, keys, stamps, notes) |
| Right-click | Remove (like `Ctrl`), or hold and drag to pan (configurable) |
| `F` | Zoom to fit |
| `Enter` | Expand / collapse selected note |
| `Del` | Delete selection |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+S` | Export JSON |
| `Esc` | Deselect |

Mouse: scroll to zoom, middle-drag to pan.

---

## File format

`Export` produces a plain JSON document. It's stable, diffable, and safe to commit next to your game's source.

```jsonc
{
  "id": "map_a1b2c3",
  "version": 2,
  "name": "Ruined Keep",
  "updated": 1753660800000,

  "areas": [
    { "id": "area_x1", "name": "Sunken Cistern", "color": "#4c8dd8",
      "region": "XianZuCi", "letter": "B" }   // UE import fields, see below
  ],

  "rooms": [
    {
      "id": "room_y1",
      "name": "Flooded Shaft",
      "areaId": "area_x1",
      "color": null,              // null = inherit the area colour
      "notes": "Ambush after the water drains.",
      "cells": ["3,4", "4,4", "4,5"],
      "number": 1                 // UE import field, see below
    }
  ],

  "doors": [
    {
      "id": "door_z1",
      "x": 5, "y": 4,
      "o": "v",                   // "v" or "h" — see edge convention below
      "kind": "door",             // "passage" | "door" | "oneway"
      "dir": 1,                   // one-way only: 1 = +axis, -1 = -axis
      "lockId": "lock_q1"         // null when unlocked
    }
  ],

  "locks": [
    { "id": "lock_q1", "name": "Grapple Gate", "color": "#e0555f",
      "keyIds": ["key_k1", "key_k2"] }   // any one of these opens it
  ],

  "keys": [
    { "id": "key_k1", "name": "Grapple", "color": "#5aa9f0", "x": 9, "y": 2 }
  ],

  "structures": [
    { "id": "struct_s1", "name": "Breakable Wall", "color": "#c9885a",
      "notes": "Bomb it.", "typeId": "OneWayDoor",   // UE import field, see below
      "rects": [ { "x": 4, "y": 4, "w": 1, "h": 2 }, { "x": 5, "y": 5.5, "w": 1.5, "h": 0.5 } ] }
  ],

  "stamps": [
    { "id": "stamp_m1", "name": "Save Point", "emoji": "💾", "color": "#5aa9f0",
      "notes": "", "points": [ { "x": 6, "y": 4 }, { "x": 9.25, "y": 2.5 } ] }
  ],

  "pencil": [
    { "id": "pen_p1", "color": "#f0dc3a", "size": 3, "pts": [96, 128, 112.5, 131, 140, 150] }
  ],

  "notes": [
    { "id": "note_n1", "name": "Boss door", "text": "Opens after the Grapple fight.\nCheck the softlock.",
      "color": "#f0dc3a", "x": 5, "y": 3.5, "expanded": false }
  ],

  "edgeStructs": [
    { "id": "edge_e1", "name": "Ledge", "color": "#f0a13a", "notes": "",
      "segs": [ { "x1": 3, "y1": 5, "x2": 5, "y2": 5 }, { "x1": 5, "y1": 5, "x2": 6.5, "y2": 3.5 } ] }
  ]
}
```

### Conventions

**Version 2** (MVMap 2.0). Files from 1.x (`version: 1`, structures / stamps as `cells`, edge structures as `edges`) load fine and are converted on the way in: structure cells become rectangles, runs of edges on one grid line become segments, stamp cells become points. 2.0 always saves and exports version 2, which the 1.x editor can't read.

**Cells** are `"x,y"` strings in world grid coordinates, used by rooms (and doors' edges). Both axes are unbounded and may go negative.

**Off-grid coordinates** — structures, edge structures, stamps, notes and keys use numbers in cell units, with the same origin and axes as the cells (`x: 3.5` is half way across cell column 3). They lie on a lattice of 1/96 cell — 96 is a multiple of every snap step — and are written with at most 4 decimals (`⅓` is `0.3333`); readers that need exact values can round `v * 96` to an integer.

**Door edges** are identified by an orientation plus a cell coordinate:

- `"v"` at `(x, y)` is the vertical edge dividing cells `(x-1, y)` and `(x, y)`
- `"h"` at `(x, y)` is the horizontal edge dividing cells `(x, y-1)` and `(x, y)`

**Structure rects** are axis-aligned `{ x, y, w, h }` on an independent layer: an area can be in one room *and* one structure. The layer is exclusive — no point belongs to two structures, and a structure's own rects never overlap. They are kept in a canonical form: the area is cut into horizontal bands at every rect edge, each band's maximal runs are taken, and a run is stacked onto the rect above it when that rect has exactly the same x-range. The same area always gives the same list, and each connected piece's rects are exactly the canonical form of that piece.

**Stamp points**, **keys** and **notes** are `{ x, y }`, the top-left corner of the one-cell box they occupy; the centre is `(x + 0.5, y + 0.5)`. No two stamps share exactly the same point.

**Pencil strokes** are free polylines in world pixels (one grid cell = 32 px, same origin as the grid), stored flat as `[x0, y0, x1, y1, …]`; `size` is the stroke width in world pixels, so drawings scale with the map. A one-point stroke is a dot.

**Notes** sit at `(x, y)` as above, at most one at any exact spot. `expanded` is saved with the map, so an open note stays open. `box: { dx, dy }`, when present, is how far the open box was dragged from its default spot beside the note, in screen pixels (the box is drawn at a fixed screen size, so the offset holds at any zoom).

**`labelPos`** on a room places its name: `"tl"`, `"tr"`, `"bl"` or `"br"` for a corner; absent means centred.

**`hideName: true`** may appear on rooms, structures, edge structures, stamps, notes and keys to hide that object's label on the map. When absent the name is shown.

**Edge-structure segments** are `{ x1, y1, x2, y2 }`, any angle. Within one edge structure, segments on the same line that touch or overlap are merged, so the list never repeats a stretch; across edge structures a stretch belongs to at most one (crossings are fine). Segments are stored pointing left to right, or top to bottom when vertical.

**Grey-box data** (`detail`) from older files is dropped on load: 2.0 has no grey-box editor, since rooms are now laid out directly on the map.

**UE import fields** feed the NSProject whitebox importer, which builds sub-level names and FacilityID tags from them (`XianZuCi_Room_B01_LD`).
`area.region` is an `ENSRegionList` enum name picked from `mvmap-types.js`; it is set from any room's inspector and applies to the whole area.
`area.letter` is that region's letter, written on export only. `room.number` is a positive integer, unique within its area; the room's code is the letter plus the number padded to two digits (`B01`).
Export always writes all three, with `null` when unset; older files without them load fine. Duplicate numbers in an area, or unknown regions, are reported when a map is imported or opened from the library, and again on export.
`typeId` on structures, edge structures and stamps is a type id from `mvmap-types.js`, picked in the inspector's Type dropdown (only that layer's types are offered); the element's name is display only. An element with no `typeId` field gets one when a map is loaded, if its name is exactly a type's label for that layer; otherwise it is listed in red as 未分类. `typeId: null` (elements created in the editor, or 未分类 picked by hand) is never re-guessed from the name. A renamed type keeps its old ids and labels in `oldIds` / `oldLabels`: on load, a `typeId` that is an old id becomes the current id, and an untyped element named with an old label is classified too (e.g. `Wall` / 墙体 → `Landscape` / 地形). Picking a type for a new element that still has its default name (`Structure 1`, `Platform 1`, `Stamp 1`) also gives it the type's label, colour and (stamps) emoji. Export writes `typeId` only when it is a type of the element's layer, and leaves the field out otherwise.

**Import** always assigns a fresh `id`, so importing a file can never overwrite a map already in your library. The map that was open becomes the newest undo step, so `Ctrl+Z` straight after an import brings it back.

### Browser storage

| | |
|---|---|
| IndexedDB | database `mvmap2`, object store `maps`, keyed on `id` |
| localStorage fallback | `mvmap2:docs` — all documents, keyed by id |
| localStorage | `mvmap2:last` — id of the last-opened map, restored on load |
| localStorage | `mvmap2:v1-imported` — set once the 1.x library has been copied over |

2.0 keeps its library apart from 1.x (database `mvmap`, `mvmap:docs`, `mvmap:last`), so that a 1.x editor on the same site can never load a version-2 map and save it back without its geometry. The first time 2.0 starts in a browser it copies every 1.x map into its own library, converted to version 2; the 1.x library is left untouched. The per-browser preferences below are shared by both.
| localStorage | `mvmap:rclick` — right-click behaviour, `remove` or `pan` |
| localStorage | `mvmap:pencil` — pencil colour, brush size and eraser size |
| localStorage | `mvmap:stampzoom` — zoom percentage above which stamp names show (default `60`) |
| localStorage | `mvmap:keys` — custom tool shortcuts, `{ "toolId": "key", … }` |
| localStorage | `mvmap:snap` — snap step: `1`, `1/2`, `1/3`, `1/4`, `1/6`, `1/8` or `free` |

---

## Repo

```
index.html          page shell; loads the two scripts below, then src/main.ts
mvmap-types.js      vocabulary shared with the UE importer (regions, element types); edit this, not the app
mvmap-ue.js         pure helpers for the UE import fields (validation, room code, element types, export shape)
src/
  model/            document types, newDoc, migrate (incl. 1.x -> 2.0), colours and emoji
  geom/             tick lattice and snap steps, rect regions (union / subtract / canonical form / pieces / outline),
                    segments (merge / cut / pieces)
  state/            runtime state, undo, storage, snapping, room / door / key edits, off-grid layer edits, pencil
  render/           camera, grid / rooms / doors / keys, structures / edges / stamps / markers, notes, render loop
  tools/            pointer and keyboard input, tool shortcuts
  ui/               panels, inspector, snap bar, pencil bar, modals
  io/               JSON import / export, PNG export
  styles/           app.css
test/               node --test: vocabulary, UE helpers, geometry, 1.x migration
docs/2.0-design.md  2.0 design decisions
export_mvmap_stamp_icons.py   renders the manual types' emoji as UE placeholder icons (reads the stamp font from src/)
```

---

## Notes

Tested in Chromium-based browsers. Requires Canvas 2D, IndexedDB or localStorage, and pointer events — nothing exotic, but there's no polyfill layer, so a very old browser will simply fail rather than degrade.

1.x was a single `index.html`; it lives on in the `v1` branch.
