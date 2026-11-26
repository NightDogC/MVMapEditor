/* Pure helpers for the fields the UE whitebox importer reads: area region, room number, element typeId, stamp tier and
   anchor, export shape.
   Loaded by index.html as a classic <script> (exposes window.MVMapUE) and by node tests via require(). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MVMapUE = api;
})(this, function () {
  "use strict";

  const isRoomNumber = (n) => Number.isInteger(n) && n > 0;

  /** "B" + 1 -> "B01". Two digits minimum, longer numbers are kept as-is. Empty when either part is unset or invalid. */
  function roomCode(letter, number) {
    if (!letter || !isRoomNumber(number)) return "";
    return letter + String(number).padStart(2, "0");
  }

  /** Room number typed into the inspector. Blank = unset; anything but a positive integer is an error. */
  function parseRoomNumber(text) {
    const t = String(text == null ? "" : text).trim();
    if (t === "") return { value: null, error: null };
    if (!/^\d+$/.test(t) || Number(t) === 0) return { value: null, error: "Number must be a positive integer (1, 2, 3…)" };
    return { value: Number(t), error: null };
  }

  const findRegion = (regions, name) => regions.find((x) => x.region === name) || null;

  /** Problems the UE importer would trip over, as human-readable lines. Shown on file load and on export. */
  function findUeFieldErrors(doc, regions) {
    const errors = [];
    for (const r of doc.rooms || []) {
      if (r.number != null && !isRoomNumber(r.number)) errors.push(`Room "${r.name}": number ${JSON.stringify(r.number)} is not a positive integer`);
    }
    for (const area of doc.areas || []) {
      if (area.region != null && !findRegion(regions, area.region)) errors.push(`Area "${area.name}": unknown region "${area.region}"`);
      const byNumber = new Map();
      for (const r of doc.rooms || []) {
        if (r.areaId !== area.id || !isRoomNumber(r.number)) continue;
        if (!byNumber.has(r.number)) byNumber.set(r.number, []);
        byNumber.get(r.number).push(r.name);
      }
      for (const [n, names] of byNumber) {
        if (names.length > 1) errors.push(`Area "${area.name}": number ${n} is used by ${names.map((x) => `"${x}"`).join(", ")}`);
      }
    }
    return errors;
  }

  /* ── vocabulary ───────────────────────────────────────────────────
     Structure and edge types are fixed in mvmap-types.js (`types`). Stamp types live in each document's
     `stampCategories` ({ submenus, types }, shape in mvmap-types.js defaultStampCategories), shaped like the UE importer's
     settings: types[id].tiers[tier] <-> StampTypes[id].Tiers[tier]. Submenus only group types in the Type dropdown; UE
     doesn't read them. A stamp stores its type's id in `typeId` and the id of one of the type's tiers in `tier`.
     A type's import method (auto / manual) is not stored in the document: it is what UE does with the type, mirrored in
     mvmap-types.js (importMethodOf). Functions working on one element take a vocabulary { types, stamp, defaults } built
     by vocabOf. */

  const EMPTY_CATEGORIES = { submenus: [], types: [] };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const findIn = (list, id) => (id != null && list.find((x) => x.id === id)) || null;

  /** The vocabulary of a document: the fixed structure / edge types, the document's stamp categories, and the default
      stamp categories (mvmap-types.js defaultStampCategories), which say how UE imports each stamp type. */
  const vocabOf = (doc, types, defaults) => ({
    types: types || [],
    stamp: (doc && doc.stampCategories) || EMPTY_CATEGORIES,
    defaults: defaults || EMPTY_CATEGORIES,
  });

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const isId = (v) => typeof v === "string" && v !== "";

  /* Loading categories. Two steps:
     1. upgradeCategoryShape: categories written before they matched UE (`groups` with a tier each, a type's `tier`
        object, `group`, `generate`) take the current shape. A format upgrade, not a fault of the file: not reported.
     2. cleaning hand-edited categories. Every cleaning step calls `report(line)` with what it dropped or filled in, so
        loading a file can say so (stampCategoryProblems) instead of changing it silently. The editor itself never
        writes anything these steps change. */

  /** A pre-upgrade tier object { label, values } as { tierLabel, tiers }; null when it isn't one. */
  const splitOldTier = (tier) => (isObj(tier) ? { tierLabel: tier.label, tiers: tier.values } : null);

  /** Categories in the current shape, upgraded in place:
      - each group becomes a submenu (id and label kept), its tier copied to every type inside it;
      - a type's `group` becomes `submenu`, its own `tier` splits into `tierLabel` + `tiers` (a type inside a group
        with a tier took the group's, so its own is dropped then);
      - `generate` and `importMethod` go: the import method comes from mvmap-types.js (importMethodOf).
      Categories already in the current shape stay as they are. */
  function upgradeCategoryShape(c) {
    const groups = Array.isArray(c.groups) ? c.groups.filter((g) => isObj(g) && isId(g.id)) : [];
    if ("groups" in c) {
      if (!("submenus" in c)) c.submenus = groups.map((g) => ({ id: g.id, label: g.label }));
      delete c.groups;
    }
    for (const t of Array.isArray(c.types) ? c.types : []) {
      if (!isObj(t)) continue;
      if ("group" in t) {
        if (!("submenu" in t)) t.submenu = t.group;
        delete t.group;
      }
      const group = groups.find((g) => g.id === t.submenu);
      const fromGroup = !!(group && group.tier);
      const tier = splitOldTier(fromGroup ? group.tier : t.tier);
      if (fromGroup || "tier" in t) {
        delete t.tier;
        if (tier && !("tiers" in t)) Object.assign(t, clone(tier));
      }
      delete t.generate;
      delete t.importMethod;
    }
    return c;
  }

  /** A list field that is there but isn't a list counts as empty, and is reported. */
  function listOf(list, what, report) {
    if (list != null && !Array.isArray(list)) report(`${what}: not a list, ignored`);
    return Array.isArray(list) ? list : [];
  }
  /** Entries of a list that are objects with a string id, first one of each id kept. */
  function withIds(list, what, report) {
    const seen = new Set();
    return list.filter((x, i) => {
      if (!isObj(x) || !isId(x.id)) report(`${what} #${i + 1}: no id, dropped`);
      else if (seen.has(x.id)) report(`${what} "${x.id}": repeated, the later one dropped`);
      else return seen.add(x.id);
      return false;
    });
  }
  /** An entry with a string label (its id when it has none). */
  function labelled(x, where, report) {
    if (typeof x.label !== "string") report(`${where}: no name, named by its id`);
    return { ...x, label: typeof x.label === "string" ? x.label : x.id };
  }
  /** A type with every field the editor reads: tiers only with a tier label and the other way round. */
  function cleanType(x, report) {
    const where = `Type "${x.id}"`;
    const out = labelled(x, where, report);
    const filled = [];
    if (typeof out.emoji !== "string") {
      out.emoji = "";
      filled.push("emoji");
    }
    if (typeof out.color !== "string") {
      out.color = "#888888";
      filled.push("color");
    }
    if (filled.length) report(`${where}: ${filled.join(", ")} missing or invalid, default used`);
    if (out.tiers != null) {
      if (!Array.isArray(out.tiers)) report(`${where}: tiers is not a list, dropped`);
      else {
        out.tiers = withIds(out.tiers, `${where} tier`, report).map((v) => labelled(v, `${where} tier "${v.id}"`, report));
        if (typeof out.tierLabel !== "string") {
          report(`${where}: tiers without a tier label, named "档位"`);
          out.tierLabel = "档位";
        }
      }
    }
    if (!Array.isArray(out.tiers)) {
      if (out.tierLabel != null) report(`${where}: tier label without tiers, dropped`);
      delete out.tiers;
      delete out.tierLabel;
    }
    return out;
  }

  /** The document's stamp categories upgraded to the current shape and cleaned (entries without an id, repeated ids
      and malformed tiers dropped, missing fields filled), or a copy of `defaults` when it has none (without
      `importMethod`: that stays in mvmap-types.js); with the lines saying what the cleaning changed. */
  function cleanStampCategories(doc, defaults) {
    const problems = [];
    const report = (line) => problems.push(line);
    const has = doc != null && doc.stampCategories != null;
    if (has && !isObj(doc.stampCategories)) report("stampCategories: not an object, the default categories used");
    const c = upgradeCategoryShape(has && isObj(doc.stampCategories) ? clone(doc.stampCategories) : clone(defaults || EMPTY_CATEGORIES));
    const submenus = withIds(listOf(c.submenus, "submenus", report), "Submenu", report).map((s) => labelled(s, `Submenu "${s.id}"`, report));
    const types = withIds(listOf(c.types, "types", report), "Type", report).map((t) => cleanType(t, report));
    return { categories: { ...c, submenus, types }, problems };
  }

  /** Copy of the document with stamp categories: its own, upgraded and cleaned so an old or hand-edited file can't
      break the editor, else a copy of `defaults` (cleanStampCategories). */
  function fillStampCategories(doc, defaults) {
    const out = clone(doc);
    out.stampCategories = cleanStampCategories(doc, defaults).categories;
    return out;
  }

  /** What loading would change in the document's own stamp categories, one line each (empty when nothing, or when it
      has none). Upgrading old categories to the current shape is not among them. Shown when a file is imported. */
  const stampCategoryProblems = (doc) => cleanStampCategories(doc, EMPTY_CATEGORIES).problems;

  /** Element types offered in a layer's "Type" dropdown. layer: "structure" | "edge" | "stamp". */
  const typesForLayer = (vocab, layer) => (layer === "stamp" ? vocab.stamp.types : vocab.types.filter((t) => t.layer === layer));
  const findType = (vocab, layer, id) => (id != null && typesForLayer(vocab, layer).find((t) => t.id === id)) || null;

  /** The element's type, or null when it has none (no typeId, an id not in the vocabulary, or a type for another layer). */
  const elementTypeOf = (el, layer, vocab) => (el && findType(vocab, layer, el.typeId)) || null;

  /* Band edges: an edge type with `band: { thickness }` (mvmap-types.js) is drawn along a terrain surface and grows a
     thickness into the empty side. Each segment may store its own thickness `t` (cells); without one it has the type's
     default. */
  const bandOfType = (t) => (t && isObj(t.band) && Number.isFinite(t.band.thickness) && t.band.thickness > 0 ? t.band : null);
  /** Whether typeId is a band edge type. */
  const isBandType = (typeId, vocab) => !!bandOfType(findType(vocab, "edge", typeId));
  /** A band edge type's default thickness (cells), or null when typeId isn't a band edge type. */
  function bandThicknessOf(typeId, vocab) {
    const band = bandOfType(findType(vocab, "edge", typeId));
    return band ? band.thickness : null;
  }

  /** The submenu a stamp type is shown in, or null (none, or a submenu id the categories don't have). */
  const submenuOfType = (vocab, t) => (t && t.submenu != null ? findIn(vocab.stamp.submenus, t.submenu) : null);

  /** A type's tiers, or null when it has none (structure / edge types never do). */
  const tiersOfType = (t) => (t && Array.isArray(t.tiers) ? t.tiers : null);

  /** How the UE importer brings a type in: "auto" (generates it) or "manual" (a placeholder, placed by hand). A
      structure / edge type says so itself; a stamp type is auto only when the default stamp categories say so, whatever
      the document's categories hold (a type a designer added stays manual until it is added to mvmap-types.js). */
  function importMethodOf(typeId, layer, vocab) {
    const t = layer === "stamp" ? findIn(vocab.defaults.types, typeId) : findType(vocab, layer, typeId);
    return t && t.importMethod === "auto" ? "auto" : "manual";
  }

  /** The element's tier ({ id, label } of its type's tiers), or null when it has none or its `tier` isn't one of them. */
  function tierOf(el, layer, vocab) {
    const tiers = tiersOfType(elementTypeOf(el, layer, vocab));
    return (tiers && el.tier != null && tiers.find((v) => v.id === el.tier)) || null;
  }

  /** "complete": exported with typeId. "incomplete": the type has tiers and the element hasn't picked one of them;
      exported without typeId. "unclassified": no type the vocabulary knows. */
  function elementStatusOf(el, layer, vocab) {
    const t = elementTypeOf(el, layer, vocab);
    if (!t) return "unclassified";
    return tiersOfType(t) && !tierOf(el, layer, vocab) ? "incomplete" : "complete";
  }

  /** Text for an element that isn't complete, shown red in the list and the inspector: "近战（未选强弱）", "未分类".
      Empty for a complete element. */
  function statusLabelOf(el, layer, vocab) {
    const status = elementStatusOf(el, layer, vocab);
    if (status === "complete") return "";
    if (status === "unclassified") return "未分类";
    const t = elementTypeOf(el, layer, vocab);
    return `${t.label}（未选${t.tierLabel}）`;
  }

  /** Map marker for an element the UE importer won't generate: "manual" (placed by hand), "unclassified" (not complete,
      so the importer only leaves a placeholder for it too), or null for complete auto types. */
  function manualMarkOf(el, layer, vocab) {
    if (elementStatusOf(el, layer, vocab) !== "complete") return "unclassified";
    return importMethodOf(el.typeId, layer, vocab) === "manual" ? "manual" : null;
  }

  /** Copy of the document as written to .mvmap.json: every area gets region + letter, every room gets number (null = unset),
      structures/edgeStructs keep typeId only when it names a type of their layer (unclassified = no typeId field), every
      stamp gets its anchor (stampAnchorOf: a type that locks its anchor overrides the element's). Segment thicknesses
      (`t`) stay only on band edge types (isBandType). Stamps write only what
      is valid in the document's stamp categories:
      - typeId only when complete; an incomplete stamp's type goes to `pendingTypeId` instead, which the importer doesn't
        read and loading the file back turns into typeId again;
      - tier only when it is one of its type's tiers.
      Stamp points keep their id as stored. The stamp categories are exported as they are, every type with its
      `importMethod` (importMethodOf) for the UE importer's summary. `defaults` is mvmap-types.js
      defaultStampCategories. */
  function buildExportDoc(doc, regions, types, defaults) {
    const out = JSON.parse(JSON.stringify(doc));
    const vocab = vocabOf(out, types, defaults);
    for (const a of out.areas || []) {
      if (a.region == null) a.region = null;
      const reg = findRegion(regions, a.region);
      a.letter = reg ? reg.letter : null;
    }
    for (const r of out.rooms || []) r.number = isRoomNumber(r.number) ? r.number : null;
    for (const [list, layer] of ELEMENT_LAYERS) {
      if (layer !== "stamp") for (const el of out[list] || []) if (!elementTypeOf(el, layer, vocab)) delete el.typeId;
    }
    for (const es of out.edgeStructs || []) {
      if (!isBandType(es.typeId, vocab)) for (const g of es.segs || []) delete g.t;
    }
    for (const st of out.stamps || []) {
      const t = elementTypeOf(st, "stamp", vocab);
      const complete = elementStatusOf(st, "stamp", vocab) === "complete";
      const tier = tierOf(st, "stamp", vocab);
      st.anchor = stampAnchorOf(st, vocab);
      delete st.pendingTypeId;
      if (!complete) delete st.typeId;
      if (t && !complete) st.pendingTypeId = t.id;
      if (tier) st.tier = tier.id;
      else delete st.tier;
    }
    if (isObj(out.stampCategories)) {
      for (const t of out.stampCategories.types || []) t.importMethod = importMethodOf(t.id, "stamp", vocab);
    }
    return out;
  }

  /** Values of a stamp element's anchor, as the UE importer reads them: SnapToGround (on the ground) / FloatInAir. */
  const STAMP_ANCHORS = ["SnapToGround", "FloatInAir"];
  const isStampAnchor = (v) => STAMP_ANCHORS.includes(v);

  /** Anchor a stamp of this type starts with: the type's `anchor`, else SnapToGround (also for no type). */
  const defaultStampAnchor = (type) => (type && isStampAnchor(type.anchor) ? type.anchor : "SnapToGround");

  /** Whether the stamp's type fixes its anchor (`anchorLocked`); the inspector then hides the anchor dropdown. */
  const isStampAnchorLocked = (st, vocab) => {
    const t = elementTypeOf(st, "stamp", vocab);
    return !!(t && t.anchorLocked);
  };

  /** The stamp's effective anchor: its type's when the type locks it, else its own, else the type's default. */
  function stampAnchorOf(st, vocab) {
    const t = elementTypeOf(st, "stamp", vocab);
    if (t && t.anchorLocked) return defaultStampAnchor(t);
    return isStampAnchor(st.anchor) ? st.anchor : defaultStampAnchor(t);
  }

  /** Copy of the document where every stamp's anchor is its effective one (stampAnchorOf): missing or unknown anchors get
      the type's default, locked types get theirs. Run after migrateTypeIds, so migrated types give the right default. */
  function migrateStampAnchors(doc, types) {
    const out = JSON.parse(JSON.stringify(doc));
    const vocab = vocabOf(out, types);
    for (const st of out.stamps || []) st.anchor = stampAnchorOf(st, vocab);
    return out;
  }

  /** Document list -> the vocabulary layer its elements use. */
  const ELEMENT_LAYERS = [
    ["structures", "structure"],
    ["edgeStructs", "edge"],
    ["stamps", "stamp"],
  ];

  /** Moves a stamp to the target of an oldStampIds entry ({ type, tier }, both optional), as far as the document's
      categories have it: the type when it exists, and the tier when the type has it. An entry without a type makes the
      stamp 未分类 (typeId null). Nothing changes when its type isn't in the categories. */
  function applyOldStampId(el, old, vocab) {
    if (old.type == null) {
      el.typeId = null;
      delete el.tier;
      return;
    }
    const t = findType(vocab, "stamp", old.type);
    if (!t) return;
    el.typeId = t.id;
    const tiers = tiersOfType(t);
    if (old.tier != null && tiers && tiers.some((v) => v.id === old.tier)) el.tier = old.tier;
    else delete el.tier;
  }

  /** Copy of the document where
      - every stamp that picked only a group (`typeGroup`, from before submenus) becomes 未分类: typeId null, its group
        and tier dropped, its name kept;
      - every stamp exported incomplete (`pendingTypeId`, see buildExportDoc) gets its type back in typeId;
      - every element whose typeId isn't a type of its layer is migrated: structures / edges to the renamed type whose
        `oldIds` has it, stamps to the target of their `oldStampIds` entry (applyOldStampId);
      - every element without a typeId field gets one if its name is exactly a type label, or an old label (structure /
        edge `oldLabels`, stamp `oldStampIds` labels), of its layer.
      Stamp types come from the document's stampCategories (fillStampCategories first). Other typeIds are kept as-is,
      including ones the vocabulary doesn't know and null (created in the editor, or 未分类 picked by hand). */
  function migrateTypeIds(doc, types, oldStampIds) {
    const out = JSON.parse(JSON.stringify(doc));
    const vocab = vocabOf(out, types);
    const olds = oldStampIds || [];
    for (const [list, layer] of ELEMENT_LAYERS) {
      const layerTypes = typesForLayer(vocab, layer);
      for (const el of out[list] || []) {
        if ("typeGroup" in el) {
          if (el.typeId == null && el.typeGroup != null) {
            el.typeId = null;
            delete el.tier;
          }
          delete el.typeGroup;
        }
        if ("pendingTypeId" in el) {
          if (el.typeId === undefined && isId(el.pendingTypeId)) el.typeId = el.pendingTypeId;
          delete el.pendingTypeId;
        }
        if (el.typeId === undefined) {
          const t = layerTypes.find((x) => x.label === el.name || (x.oldLabels || []).includes(el.name));
          const old = layer === "stamp" && !t ? olds.find((x) => x.label === el.name) : null;
          if (t) el.typeId = t.id;
          else if (old) applyOldStampId(el, old, vocab);
        } else if (el.typeId != null && !layerTypes.some((x) => x.id === el.typeId)) {
          if (layer === "stamp") {
            const old = olds.find((x) => x.id === el.typeId);
            if (old) applyOldStampId(el, old, vocab);
          } else {
            const renamed = layerTypes.find((x) => (x.oldIds || []).includes(el.typeId));
            if (renamed) el.typeId = renamed.id;
          }
        }
      }
    }
    return out;
  }

  /** Everything loading does to element types, in order: stamp categories (upgraded to the current shape; the defaults
      when the document has none) -> old ids -> stamp anchors. `typesFile` is mvmap-types.js. */
  function migrateTypeData(doc, typesFile) {
    const withCategories = fillStampCategories(doc, typesFile.defaultStampCategories);
    return migrateStampAnchors(migrateTypeIds(withCategories, typesFile.types, typesFile.oldStampIds), typesFile.types);
  }

  /** A stamp leaving a type that locked its anchor gets SnapToGround back: that anchor was never the user's choice. */
  function resetLockedAnchor(out, oldType, layer) {
    if (layer === "stamp" && oldType && oldType.anchorLocked) out.anchor = defaultStampAnchor(null);
  }

  /** Sections of the stamp categories, as the category panel lists them: { submenu: null, types } for the types outside
      any submenu (a submenu id the categories don't have counts as none), first; then { submenu, types } for every
      submenu, in category order, empty ones included. Types keep category order inside a section. */
  function stampCategorySections(vocab) {
    const types = vocab.stamp.types;
    const sections = [{ submenu: null, types: types.filter((t) => !submenuOfType(vocab, t)) }];
    for (const s of vocab.stamp.submenus) sections.push({ submenu: s, types: types.filter((t) => submenuOfType(vocab, t) === s) });
    return sections;
  }

  /** Sections of a layer's "Type" dropdown: stampCategorySections without the sections that have no types. Structure /
      edge layers have one section, { submenu: null, types }. */
  function typePickerSections(vocab, layer) {
    const types = typesForLayer(vocab, layer);
    if (layer !== "stamp") return types.length ? [{ submenu: null, types }] : [];
    return stampCategorySections(vocab).filter((x) => x.types.length);
  }

  /** Name the editor gives the n-th new element of a layer, before the user renames it or picks a type. */
  const DEFAULT_NAME_PREFIX = { structure: "Structure ", edge: "Platform ", stamp: "Stamp " };
  const defaultElementName = (layer, n) => DEFAULT_NAME_PREFIX[layer] + n;
  const hasDefaultName = (el, layer) => new RegExp("^" + DEFAULT_NAME_PREFIX[layer] + "\\d+$").test(el.name);

  /** The name the editor gives an element of its type: the type's label, "submenu·type" for a stamp type in a submenu,
      plus "·tier" when `withTier` and a tier is picked ("敌人·近战·精英"); null without a type. */
  function autoNameOf(el, layer, vocab, withTier) {
    const t = elementTypeOf(el, layer, vocab);
    if (!t) return null;
    const s = layer === "stamp" ? submenuOfType(vocab, t) : null;
    const v = withTier ? tierOf(el, layer, vocab) : null;
    return [s && s.label, t.label, v && v.label].filter(Boolean).join("·");
  }

  /** Whether a stamp keeps its tier when its type changes from `oldType` to `newType`: the new type has a tier with the
      same id, and its tier label is the same (近战 -> 飞行, both 强弱; not 钱盒·中 -> 近战, Medium in both but 大小 vs
      强弱). */
  function keepsTier(tierId, oldType, newType) {
    const tiers = tiersOfType(newType);
    return !!(tierId != null && oldType && tiers && tiersOfType(oldType) && oldType.tierLabel === newType.tierLabel && tiers.some((v) => v.id === tierId));
  }

  /** Copy of the element after picking `typeId` in its Type dropdown ("" = 未分类, stored as null so loading never
      re-guesses it, and dropping the tier).
      A brand-new element (typeId null or missing, default name) also takes the type's name (autoNameOf: "submenu·type"
      for a stamp type in a submenu, plus the tier it keeps) and colour, and its emoji on stamps.
      An element still named by the editor after its old type (autoNameOf, with or without its tier: "敌人·近战",
      "敌人·近战·精英") is renamed after the new one ("敌人·飞行·精英"), as chooseTier does; a name the user typed is kept.
      An id that isn't a type of this layer (the dropdown's "unknown: …" entry) changes nothing.
      The tier stays when the new type has it under the same tier label (keepsTier), else it goes.
      Stamps also get the new type's anchor when it locks one, and its default anchor when the element is brand-new or its
      old type locked the anchor (that anchor was never the user's choice); otherwise they keep their anchor. */
  function chooseType(el, layer, typeId, vocab) {
    const out = Object.assign({}, el);
    const oldType = elementTypeOf(el, layer, vocab);
    const isNew = el.typeId == null && hasDefaultName(el, layer);
    const editorNamed = !!oldType && (el.name === autoNameOf(el, layer, vocab, false) || el.name === autoNameOf(el, layer, vocab, true));
    if (!typeId) {
      out.typeId = null;
      delete out.tier;
      resetLockedAnchor(out, oldType, layer);
      return out;
    }
    const t = findType(vocab, layer, typeId);
    if (!t) return out;
    out.typeId = t.id;
    if (!keepsTier(tierOf(el, layer, vocab)?.id, oldType, t)) delete out.tier;
    if (isNew) {
      out.name = autoNameOf(out, layer, vocab, true);
      out.color = t.color;
      if (layer === "stamp") out.emoji = t.emoji;
    } else if (editorNamed) out.name = autoNameOf(out, layer, vocab, true);
    if (layer === "stamp" && (t.anchorLocked || isNew || (oldType && oldType.anchorLocked) || !isStampAnchor(el.anchor))) {
      out.anchor = defaultStampAnchor(t);
    }
    return out;
  }

  /** Copy of the element after picking tier `tierId` ("" clears it). An id that isn't one of its type's tiers changes
      nothing. An element still named by the editor (autoNameOf, with or without its old tier: "钱盒", "钱盒·中") is
      renamed to match ("钱盒·大"); a name the user typed is kept. */
  function chooseTier(el, layer, tierId, vocab) {
    const out = Object.assign({}, el);
    if (!tierId) delete out.tier;
    else if ((tiersOfType(elementTypeOf(el, layer, vocab)) || []).some((v) => v.id === tierId)) out.tier = tierId;
    else return out;
    const named = autoNameOf(el, layer, vocab, false);
    if (named !== null && (el.name === named || el.name === autoNameOf(el, layer, vocab, true))) out.name = autoNameOf(out, layer, vocab, true);
    return out;
  }

  /* ── editing the stamp categories ─────────────────────────────────
     Every edit returns a new document; the input is left as it is. Ids never change: a rename edits only a label, so
     stamps are untouched. After the edit the stamps are repaired (repairStamps). Emoji and colour edits don't reach
     placed stamps: a stamp takes them only when it is brand-new and picks the type (chooseType). Submenus only arrange
     the Type dropdown: no submenu edit changes a stamp. */

  /** Ids a submenu, type or tier the designer adds must not take (the panel draws a random one outside them, see
      newCategoryId in src/util.ts): the document's submenus, types and tiers, and the ids its stamps still hold (typeId,
      tier), so a stamp left with a deleted id never ends up on a new entry. */
  function usedCategoryIds(doc) {
    const c = (doc && doc.stampCategories) || EMPTY_CATEGORIES;
    const used = new Set();
    for (const x of [...c.submenus, ...c.types]) {
      used.add(x.id);
      for (const v of tiersOfType(x) || []) used.add(v.id);
    }
    for (const st of (doc && doc.stamps) || []) for (const id of [st.typeId, st.tier]) if (isId(id)) used.add(id);
    return used;
  }

  /** Clears, on every stamp of `out`, each id that named something in `before`'s categories and no longer does in
      `out`'s:
      - its type gone: typeId null (未分类), tier removed; a type that locked the anchor leaves SnapToGround behind (as
        chooseType does);
      - its tier no longer one of its type's tiers: tier removed.
      Ids that were already unknown before the edit stay as they are. Anchors end up as stampAnchorOf says, so a locked
      type's anchor change reaches its stamps. */
  function repairStamps(before, out) {
    const vb = vocabOf(before);
    const va = vocabOf(out);
    for (const st of out.stamps || []) {
      const oldType = elementTypeOf(st, "stamp", vb);
      const oldTier = tierOf(st, "stamp", vb);
      if (oldType && !findType(va, "stamp", oldType.id)) {
        st.typeId = null;
        if (oldType.anchorLocked) st.anchor = defaultStampAnchor(null);
      }
      if (oldTier && !tierOf(st, "stamp", va)) delete st.tier;
      st.anchor = stampAnchorOf(st, va);
    }
    return out;
  }

  /** Copy of the document with `edit(categories)` applied to its stamp categories, stamps repaired. */
  function editCategories(doc, edit) {
    const out = clone(doc);
    if (!isObj(out.stampCategories)) out.stampCategories = clone(EMPTY_CATEGORIES);
    edit(out.stampCategories);
    return repairStamps(doc, out);
  }

  /* ── renaming ids ─────────────────────────────────────────────────
     A designer may give a type or tier they added a readable id (`Type_k3x9qa` -> `TreasureChest`): the UE side
     configures placeholders and generation by typeId and tier id, and names icons after the typeId. Ids that are in the
     default categories (mvmap-types.js defaultStampCategories) are locked: the UE side is configured for them. When
     the UE side starts to support a type a designer added, it goes into the defaults, which locks it too. Submenu ids
     are not renamed: nothing outside the document reads them.
     `ref` names the entry: { type }, or a tier { type, tier }. */

  /** Letters, digits and `_`, starting with a letter: usable as a UE config key and in an asset name. */
  const ID_TEXT = /^[A-Za-z][A-Za-z0-9_]*$/;

  /** The entry `ref` names in categories `c`, the list it is unique in, and for a tier its type; null when there is
      none. */
  function refEntry(c, ref) {
    const t = findIn(c.types, ref.type);
    if (!t) return null;
    if (ref.tier == null) return { kind: "type", entry: t, siblings: c.types };
    const v = findIn(tiersOfType(t) || [], ref.tier);
    return v ? { kind: "tier", entry: v, siblings: t.tiers, type: t } : null;
  }

  /** Whether the entry's id is one of the default categories' (a tier: of the same type). */
  const isCategoryIdLocked = (ref, defaults) => !!refEntry(defaults || EMPTY_CATEGORIES, ref);

  /** Why the entry can't be renamed to `id`, or null when it can (an unchanged id included): "missing" (no such
      entry), "locked" (isCategoryIdLocked), "format" (not ID_TEXT), "taken" (another entry of the same list has it, or
      a stamp still holds it as a stale id there: a stamp's typeId, or the tier of a stamp of the same type; that stamp
      would otherwise end up on the renamed entry). */
  function categoryIdProblem(doc, ref, id, defaults) {
    const hit = refEntry(vocabOf(doc).stamp, ref);
    if (!hit) return "missing";
    if (id === hit.entry.id) return null;
    if (isCategoryIdLocked(ref, defaults)) return "locked";
    if (typeof id !== "string" || !ID_TEXT.test(id)) return "format";
    if (hit.siblings.some((x) => x.id === id)) return "taken";
    const holds = (st) => (hit.kind === "type" ? st.typeId === id : st.typeId === hit.type.id && st.tier === id);
    return (doc.stamps || []).some(holds) ? "taken" : null;
  }

  /** Copy of the document with the entry's id changed to `id`, and every reference to it: a type's stamps' typeId; a
      tier on the stamps of its type. Changes nothing when categoryIdProblem objects. */
  function renameCategoryId(doc, ref, id, defaults) {
    const out = clone(doc);
    if (categoryIdProblem(doc, ref, id, defaults)) return out;
    const hit = refEntry(out.stampCategories, ref);
    const old = hit.entry.id;
    for (const st of out.stamps || []) {
      if (hit.kind === "type" && st.typeId === old) st.typeId = id;
      if (hit.kind === "tier" && st.typeId === hit.type.id && st.tier === old) st.tier = id;
    }
    hit.entry.id = id;
    return out;
  }

  /** New submenu with no types, added last. An id already used by a submenu changes nothing. */
  function addStampSubmenu(doc, id, label) {
    return editCategories(doc, (c) => {
      if (isId(id) && !findIn(c.submenus, id)) c.submenus.push({ id, label: String(label) });
    });
  }

  /** Submenu with `patch` ({ label }) applied: a submenu has only its name to edit. */
  function updateStampSubmenu(doc, id, patch) {
    return editCategories(doc, (c) => {
      const s = findIn(c.submenus, id);
      if (s && patch && "label" in patch) s.label = String(patch.label);
    });
  }

  /** Submenu deleted. Its types stay, outside any submenu; no stamp changes. */
  function removeStampSubmenu(doc, id) {
    return editCategories(doc, (c) => {
      if (!findIn(c.submenus, id)) return;
      c.submenus = c.submenus.filter((s) => s.id !== id);
      for (const t of c.types) if (t.submenu === id) delete t.submenu;
    });
  }

  /** New type with no tiers, added last: `fields` gives label, emoji, color, and optionally anchor, anchorLocked and
      submenu (an id the categories don't have is left out). It has no import method of its own: it is manual until it
      is added to mvmap-types.js (importMethodOf). An id already used by a type changes nothing. */
  function addStampType(doc, id, fields) {
    return editCategories(doc, (c) => {
      if (!isId(id) || findIn(c.types, id)) return;
      const f = fields || {};
      const t = { id, label: String(f.label ?? id), color: String(f.color ?? "#888888"), emoji: String(f.emoji ?? "") };
      if (findIn(c.submenus, f.submenu)) t.submenu = f.submenu;
      if (isStampAnchor(f.anchor)) t.anchor = f.anchor;
      if (f.anchorLocked) t.anchorLocked = true;
      c.types.push(t);
    });
  }

  /** Fields of a type the panel edits. id (renameCategoryId), submenu (moveStampType) and the tiers (the tier edits)
      are not among them. */
  const TYPE_FIELDS = ["label", "emoji", "color", "anchor", "anchorLocked"];
  function patchType(t, patch) {
    for (const k of TYPE_FIELDS) {
      if (!patch || !(k in patch)) continue;
      const v = patch[k];
      if (k === "anchor") {
        if (isStampAnchor(v)) t.anchor = v;
      } else if (k === "anchorLocked") {
        if (v) t.anchorLocked = true;
        else delete t.anchorLocked;
      } else t[k] = String(v);
    }
  }

  /** Type with `patch` ({ label, emoji, color, anchor, anchorLocked }, any of them) applied. Placed stamps keep their
      emoji and colour; a type that locks its anchor sets its stamps' anchor. */
  function updateStampType(doc, id, patch) {
    return editCategories(doc, (c) => {
      const t = findIn(c.types, id);
      if (t) patchType(t, patch);
    });
  }

  /** Type moved into submenu `submenuId` ("" or null: out of any submenu). Only its `submenu` changes: its tiers, its
      place in the list and its stamps stay. A submenu id the categories don't have changes nothing. */
  function moveStampType(doc, id, submenuId) {
    return editCategories(doc, (c) => {
      const t = findIn(c.types, id);
      if (!t || (submenuId && !findIn(c.submenus, submenuId))) return;
      if (submenuId) t.submenu = submenuId;
      else delete t.submenu;
    });
  }

  /** Type deleted. Its stamps become 未分类 (repairStamps). */
  function removeStampType(doc, id) {
    return editCategories(doc, (c) => {
      c.types = c.types.filter((t) => t.id !== id);
    });
  }

  /** Tier label of type `typeId` set to `label`; a type without tiers gets an empty list of them. Giving a type tiers
      makes its stamps 未选<tier label> until they pick one. */
  function setStampTierLabel(doc, typeId, label) {
    return editCategories(doc, (c) => {
      const t = findIn(c.types, typeId);
      if (!t) return;
      t.tierLabel = String(label);
      if (!Array.isArray(t.tiers)) t.tiers = [];
    });
  }

  /** Every tier of type `typeId` deleted, with its tier label; its stamps lose their tier and are complete again. */
  function removeStampTiers(doc, typeId) {
    return editCategories(doc, (c) => {
      const t = findIn(c.types, typeId);
      if (!t) return;
      delete t.tiers;
      delete t.tierLabel;
    });
  }

  /** New tier, last among the type's. A type without tiers, or an id it already has, changes nothing. */
  function addStampTier(doc, typeId, id, label) {
    return editCategories(doc, (c) => {
      const tiers = tiersOfType(findIn(c.types, typeId));
      if (tiers && isId(id) && !findIn(tiers, id)) tiers.push({ id, label: String(label) });
    });
  }

  /** Tier renamed. */
  function renameStampTier(doc, typeId, id, label) {
    return editCategories(doc, (c) => {
      const v = findIn(tiersOfType(findIn(c.types, typeId)) || [], id);
      if (v) v.label = String(label);
    });
  }

  /** Tier deleted; the stamps that had it become "未选<tier label>". */
  function removeStampTier(doc, typeId, id) {
    return editCategories(doc, (c) => {
      const t = findIn(c.types, typeId);
      if (t && Array.isArray(t.tiers)) t.tiers = t.tiers.filter((v) => v.id !== id);
    });
  }

  /** How many stamps a delete would change, for "N 个元素在用". `ref`:
      - { type }: stamps of the type;
      - { type, tiers: true }: stamps with one of the type's tiers;
      - { type, tier }: stamps with that tier of the type.
      Counts stamps (a stamp's placed copies count once). */
  function countStampsUsing(doc, ref) {
    const v = vocabOf(doc);
    const uses = (st) => {
      if (elementTypeOf(st, "stamp", v)?.id !== ref.type) return false;
      if (ref.tier != null || ref.tiers) {
        const tier = tierOf(st, "stamp", v);
        return !!tier && (ref.tiers || tier.id === ref.tier);
      }
      return true;
    };
    return (doc.stamps || []).filter(uses).length;
  }

  return {
    usedCategoryIds, isCategoryIdLocked, categoryIdProblem, renameCategoryId,
    addStampSubmenu, updateStampSubmenu, removeStampSubmenu, addStampType, updateStampType, moveStampType, removeStampType,
    setStampTierLabel, removeStampTiers, addStampTier, renameStampTier, removeStampTier, countStampsUsing,
    roomCode, parseRoomNumber, findUeFieldErrors, buildExportDoc, findRegion,
    vocabOf, fillStampCategories, stampCategoryProblems, migrateTypeData, importMethodOf,
    typesForLayer, elementTypeOf, isBandType, bandThicknessOf, migrateTypeIds, defaultElementName, chooseType, manualMarkOf,
    typePickerSections, stampCategorySections, submenuOfType, tiersOfType, tierOf, autoNameOf, chooseTier, elementStatusOf, statusLabelOf,
    STAMP_ANCHORS, defaultStampAnchor, isStampAnchorLocked, stampAnchorOf, migrateStampAnchors,
  };
});
