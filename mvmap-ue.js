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
     `stampCategories` ({ groups, types }, shape in mvmap-types.js defaultStampCategories): three levels, group (optional)
     -> type (exported as typeId) -> tier (optional; defined by the group, or by a type without a group).
     A stamp stores the type's id in `typeId`, the group's id in `typeGroup` (only while no type is picked), and the tier
     value's id in `tier`. Functions working on one element take a vocabulary { types, stamp } built by vocabOf. */

  const EMPTY_CATEGORIES = { groups: [], types: [] };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const findIn = (list, id) => (id != null && list.find((x) => x.id === id)) || null;

  /** The vocabulary of a document: the fixed structure / edge types plus the document's stamp categories. */
  const vocabOf = (doc, types) => ({ types: types || [], stamp: (doc && doc.stampCategories) || EMPTY_CATEGORIES });

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const isId = (v) => typeof v === "string" && v !== "";

  /* Cleaning hand-edited categories. Every cleaning step calls `report(line)` with what it dropped or filled in, so
     loading a file can say so (stampCategoryProblems) instead of changing it silently. The editor itself never writes
     anything these steps change. */

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
  function cleanTier(tier, where, report) {
    if (tier == null) return undefined;
    if (!isObj(tier)) {
      report(`${where}: tier is not an object, dropped`);
      return undefined;
    }
    if (typeof tier.label !== "string") report(`${where}: tier has no name, named "档位"`);
    const values = withIds(listOf(tier.values, `${where} tier values`, report), `${where} tier value`, report).map((v) => {
      if (typeof v.label !== "string") report(`${where} tier value "${v.id}": no name, named by its id`);
      return { ...v, label: typeof v.label === "string" ? v.label : v.id };
    });
    return { ...tier, label: typeof tier.label === "string" ? tier.label : "档位", values };
  }
  function cleanCategory(x, kind, report) {
    const where = `${kind} "${x.id}"`;
    if (typeof x.label !== "string") report(`${where}: no name, named by its id`);
    const out = { ...x, label: typeof x.label === "string" ? x.label : x.id };
    const tier = cleanTier(x.tier, where, report);
    if (tier) out.tier = tier;
    else delete out.tier;
    return out;
  }
  /** A type with every field the editor reads; a type the designer adds is placed by hand (`manual`) until UE knows it. */
  function cleanType(x, report) {
    const out = cleanCategory(x, "Type", report);
    const filled = [];
    if (typeof out.emoji !== "string") {
      out.emoji = "";
      filled.push("emoji");
    }
    if (typeof out.color !== "string") {
      out.color = "#888888";
      filled.push("color");
    }
    if (out.generate !== "auto" && out.generate !== "manual") {
      out.generate = "manual";
      filled.push("generate (manual)");
    }
    if (filled.length) report(`Type "${x.id}": ${filled.join(", ")} missing or invalid, default used`);
    return out;
  }

  /** The document's stamp categories cleaned (entries without an id, repeated ids and malformed tiers dropped, missing
      fields filled, a tier of a type inside a group dropped: it picks from the group's), or a copy of `defaults` when it
      has none; with the lines saying what the cleaning changed. */
  function cleanStampCategories(doc, defaults) {
    const problems = [];
    const report = (line) => problems.push(line);
    const has = doc != null && doc.stampCategories != null;
    if (has && !isObj(doc.stampCategories)) report("stampCategories: not an object, the default categories used");
    const c = has && isObj(doc.stampCategories) ? clone(doc.stampCategories) : clone(defaults || EMPTY_CATEGORIES);
    const groups = withIds(listOf(c.groups, "groups", report), "Group", report).map((g) => cleanCategory(g, "Group", report));
    const types = withIds(listOf(c.types, "types", report), "Type", report).map((t) => cleanType(t, report));
    for (const t of types) {
      if (t.tier && findIn(groups, t.group)) {
        report(`Type "${t.id}": has its own tier inside group "${t.group}", dropped (it picks from the group's)`);
        delete t.tier;
      }
    }
    return { categories: { ...c, groups, types }, problems };
  }

  /** Copy of the document with stamp categories: its own, cleaned so a hand-edited file can't break the editor, else a
      copy of `defaults` (cleanStampCategories). */
  function fillStampCategories(doc, defaults) {
    const out = clone(doc);
    out.stampCategories = cleanStampCategories(doc, defaults).categories;
    return out;
  }

  /** What loading would change in the document's own stamp categories, one line each (empty when nothing, or when it
      has none). Shown when a file is imported. */
  const stampCategoryProblems = (doc) => cleanStampCategories(doc, EMPTY_CATEGORIES).problems;

  /** Element types offered in a layer's "Type" dropdown. layer: "structure" | "edge" | "stamp". */
  const typesForLayer = (vocab, layer) => (layer === "stamp" ? vocab.stamp.types : vocab.types.filter((t) => t.layer === layer));
  const groupsForLayer = (vocab, layer) => (layer === "stamp" ? vocab.stamp.groups : []);
  const findGroup = (vocab, layer, id) => (id != null && groupsForLayer(vocab, layer).find((g) => g.id === id)) || null;
  const findType = (vocab, layer, id) => (id != null && typesForLayer(vocab, layer).find((t) => t.id === id)) || null;

  /** The element's type, or null when it has none (no typeId, an id not in the vocabulary, or a type for another layer). */
  const elementTypeOf = (el, layer, vocab) => (el && findType(vocab, layer, el.typeId)) || null;

  /** The group a type belongs to, or null (no group, or a group id the categories don't have). */
  const groupOfType = (vocab, layer, t) => (t && t.group != null ? findGroup(vocab, layer, t.group) : null);

  /** Types inside a group, in category order. */
  const groupMembers = (vocab, layer, groupId) => typesForLayer(vocab, layer).filter((t) => groupOfType(vocab, layer, t)?.id === groupId);

  /** The tier a type's elements pick from: its group's when it has a group, else its own; null when there is none. */
  const tierOfType = (vocab, layer, t) => {
    const g = groupOfType(vocab, layer, t);
    return (g ? g.tier : t && t.tier) || null;
  };

  /** The element's group: its type's group when it has a type; otherwise its `typeGroup` when that is a group of the
      layer (picked without a type inside it yet); else null. */
  function typeGroupOf(el, layer, vocab) {
    const t = elementTypeOf(el, layer, vocab);
    if (t) return groupOfType(vocab, layer, t);
    return findGroup(vocab, layer, el && el.typeGroup);
  }

  /** The tier the element picks from: its type's, or its group's while it has only a group; null when there is none. */
  function tierOf(el, layer, vocab) {
    const t = elementTypeOf(el, layer, vocab);
    if (t) return tierOfType(vocab, layer, t);
    const g = typeGroupOf(el, layer, vocab);
    return (g && g.tier) || null;
  }

  /** The element's tier value, or null when it has none or its `tier` isn't a value of the tier it picks from. */
  function tierValueOf(el, layer, vocab) {
    const tier = tierOf(el, layer, vocab);
    return (tier && el.tier != null && tier.values.find((v) => v.id === el.tier)) || null;
  }

  /** What the element still lacks before it can be exported with a typeId: "小类" when it has a group but no type, the
      tier's name when it has a tier but no (valid) value. */
  function missingSteps(el, layer, vocab) {
    const missing = [];
    if (!elementTypeOf(el, layer, vocab) && typeGroupOf(el, layer, vocab)) missing.push("小类");
    const tier = tierOf(el, layer, vocab);
    if (tier && !tierValueOf(el, layer, vocab)) missing.push(tier.label);
    return missing;
  }

  /** "complete": exported with typeId. "incomplete": a group or type is picked but the element lacks a type or a tier
      value (or a stored id is no longer in the categories); exported without typeId. "unclassified": neither a type nor
      a group the vocabulary knows. */
  function elementStatusOf(el, layer, vocab) {
    if (!elementTypeOf(el, layer, vocab) && !typeGroupOf(el, layer, vocab)) return "unclassified";
    return missingSteps(el, layer, vocab).length ? "incomplete" : "complete";
  }

  /** Text for an element that isn't complete, shown red in the list and the inspector: "钱盒（未选大小）",
      "敌人（未选小类、强弱）", "未分类". Empty for a complete element. */
  function statusLabelOf(el, layer, vocab) {
    const status = elementStatusOf(el, layer, vocab);
    if (status === "complete") return "";
    if (status === "unclassified") return "未分类";
    const t = elementTypeOf(el, layer, vocab);
    const g = typeGroupOf(el, layer, vocab);
    const name = t ? (g ? `${g.label}·${t.label}` : t.label) : g.label;
    return `${name}（未选${missingSteps(el, layer, vocab).join("、")}）`;
  }

  /** Map marker for an element the UE importer won't generate: "manual" (placed by hand), "unclassified" (not complete,
      so the importer only leaves a placeholder for it too), or null for complete auto types. */
  function manualMarkOf(el, layer, vocab) {
    if (elementStatusOf(el, layer, vocab) !== "complete") return "unclassified";
    return elementTypeOf(el, layer, vocab).generate === "manual" ? "manual" : null;
  }

  /** Copy of the document as written to .mvmap.json: every area gets region + letter, every room gets number (null = unset),
      structures/edgeStructs keep typeId only when it names a type of their layer (unclassified = no typeId field), every
      stamp gets its anchor (stampAnchorOf: a type that locks its anchor overrides the element's). Stamps write only what
      is valid in the document's stamp categories:
      - typeId only when complete; an incomplete stamp's type goes to `pendingTypeId` instead, which the importer doesn't
        read and loading the file back turns into typeId again;
      - typeGroup only while no type is picked; tier only when it is a value of the stamp's tier.
      Stamp points keep their id as stored. The stamp categories are exported as they are. */
  function buildExportDoc(doc, regions, types) {
    const out = JSON.parse(JSON.stringify(doc));
    const vocab = vocabOf(out, types);
    for (const a of out.areas || []) {
      if (a.region == null) a.region = null;
      const reg = findRegion(regions, a.region);
      a.letter = reg ? reg.letter : null;
    }
    for (const r of out.rooms || []) r.number = isRoomNumber(r.number) ? r.number : null;
    for (const [list, layer] of ELEMENT_LAYERS) {
      if (layer !== "stamp") for (const el of out[list] || []) if (!elementTypeOf(el, layer, vocab)) delete el.typeId;
    }
    for (const st of out.stamps || []) {
      const t = elementTypeOf(st, "stamp", vocab);
      const g = typeGroupOf(st, "stamp", vocab);
      const complete = elementStatusOf(st, "stamp", vocab) === "complete";
      const tier = tierValueOf(st, "stamp", vocab);
      st.anchor = stampAnchorOf(st, vocab);
      delete st.pendingTypeId;
      if (!complete) delete st.typeId;
      if (t && !complete) st.pendingTypeId = t.id;
      if (!t && g) st.typeGroup = g.id;
      else delete st.typeGroup;
      if (tier) st.tier = tier.id;
      else delete st.tier;
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

  /** Moves a stamp to the target of an oldStampIds entry ({ group, type, tier }, each optional), as far as the document's
      categories have it: the type when it exists (its own group then), else the group; the tier value when the tier they
      pick from has it. Nothing changes when neither the type nor the group exists. */
  function applyOldStampId(el, old, vocab) {
    const t = findType(vocab, "stamp", old.type);
    const g = t ? null : findGroup(vocab, "stamp", old.group);
    if (!t && !g) return;
    el.typeId = t ? t.id : null;
    if (g) el.typeGroup = g.id;
    else delete el.typeGroup;
    const tier = t ? tierOfType(vocab, "stamp", t) : g.tier;
    if (old.tier != null && tier && tier.values.some((v) => v.id === old.tier)) el.tier = old.tier;
    else delete el.tier;
  }

  /** Copy of the document where
      - every stamp exported incomplete (`pendingTypeId`, see buildExportDoc) gets its type back in typeId;
      - every element whose typeId isn't a type of its layer is migrated: structures / edges to the renamed type whose
        `oldIds` has it, stamps to the target of their `oldStampIds` entry (applyOldStampId);
      - every element without a typeId field gets one if its name is exactly a type label, or an old label (structure /
        edge `oldLabels`, stamp `oldStampIds` labels), of its layer, unless it has a typeGroup (a group-only element
        exported without typeId: the group was picked on purpose).
      Stamp types come from the document's stampCategories (fillStampCategories first). Other typeIds are kept as-is,
      including ones the vocabulary doesn't know and null (created in the editor, or 未分类 picked by hand). */
  function migrateTypeIds(doc, types, oldStampIds) {
    const out = JSON.parse(JSON.stringify(doc));
    const vocab = vocabOf(out, types);
    const olds = oldStampIds || [];
    for (const [list, layer] of ELEMENT_LAYERS) {
      const layerTypes = typesForLayer(vocab, layer);
      for (const el of out[list] || []) {
        if ("pendingTypeId" in el) {
          if (el.typeId === undefined && isId(el.pendingTypeId)) el.typeId = el.pendingTypeId;
          delete el.pendingTypeId;
        }
        if (el.typeId === undefined) {
          if (el.typeGroup != null) continue;
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

  /** Everything loading does to element types, in order: stamp categories (the defaults when the document has none) ->
      old ids -> stamp anchors. `typesFile` is mvmap-types.js. */
  function migrateTypeData(doc, typesFile) {
    const withCategories = fillStampCategories(doc, typesFile.defaultStampCategories);
    return migrateStampAnchors(migrateTypeIds(withCategories, typesFile.types, typesFile.oldStampIds), typesFile.types);
  }

  /** A stamp leaving a type that locked its anchor gets SnapToGround back: that anchor was never the user's choice. */
  function resetLockedAnchor(out, oldType, layer) {
    if (layer === "stamp" && oldType && oldType.anchorLocked) out.anchor = defaultStampAnchor(null);
  }

  /** Keeps the element's tier value only when the tier it picks from stays the same one (same group, or same type). */
  function keepTierIfSame(out, oldTier, newTier) {
    if (!newTier || newTier !== oldTier) delete out.tier;
  }

  /** Entries of a layer's first-level "Type" dropdown, in category order: { type } for a type without a group, and
      { group, types } for a group, placed where its first type is; groups without types come last. A layer without
      groups gets only { type } entries. */
  function typePickerEntries(vocab, layer) {
    const entries = [];
    for (const t of typesForLayer(vocab, layer)) {
      const g = groupOfType(vocab, layer, t);
      if (!g) entries.push({ type: t });
      else if (!entries.some((e) => e.group === g)) entries.push({ group: g, types: groupMembers(vocab, layer, g.id) });
    }
    for (const g of groupsForLayer(vocab, layer)) if (!entries.some((e) => e.group === g)) entries.push({ group: g, types: [] });
    return entries;
  }

  /** Copy of the element after picking group `groupId` in the first-level dropdown without a type inside it: typeId null
      (exported without typeId), typeGroup = the group. The tier value goes, unless it came from this group's tier. Name
      and colour stay, so a brand-new element still takes the type's name when its type is picked. "" is 未分类 by hand
      (as chooseType ""). The element's own group, or a group the layer doesn't have, changes nothing. A stamp leaving a
      type that locked its anchor gets SnapToGround back. */
  function chooseTypeGroup(el, layer, groupId, vocab) {
    if (!groupId) return chooseType(el, layer, "", vocab);
    const out = Object.assign({}, el);
    const g = findGroup(vocab, layer, groupId);
    if (!g || g === typeGroupOf(el, layer, vocab)) return out;
    out.typeId = null;
    out.typeGroup = g.id;
    keepTierIfSame(out, tierOf(el, layer, vocab), g.tier || null);
    resetLockedAnchor(out, elementTypeOf(el, layer, vocab), layer);
    return out;
  }

  /** Name the editor gives the n-th new element of a layer, before the user renames it or picks a type. */
  const DEFAULT_NAME_PREFIX = { structure: "Structure ", edge: "Platform ", stamp: "Stamp " };
  const defaultElementName = (layer, n) => DEFAULT_NAME_PREFIX[layer] + n;
  const hasDefaultName = (el, layer) => new RegExp("^" + DEFAULT_NAME_PREFIX[layer] + "\\d+$").test(el.name);

  /** The name the editor gives an element of its type: the type's label, "group·type" for a type in a group, plus
      "·tier value" when `withTier` and a value is picked ("敌人·近战·精英"); null without a type. */
  function autoNameOf(el, layer, vocab, withTier) {
    const t = elementTypeOf(el, layer, vocab);
    if (!t) return null;
    const g = groupOfType(vocab, layer, t);
    const v = withTier ? tierValueOf(el, layer, vocab) : null;
    return [g && g.label, t.label, v && v.label].filter(Boolean).join("·");
  }

  /** Copy of the element after picking `typeId` in its Type / Subtype dropdown ("" = 未分类, stored as null so loading
      never re-guesses it, and dropping the group and tier value).
      A brand-new element (typeId null or missing, default name) also takes the type's name (autoNameOf: "group·type"
      for a type in a group, plus the tier value it keeps) and colour, and its emoji on stamps.
      An id that isn't a type of this layer (the dropdown's "unknown: …" entry) changes nothing.
      The tier value stays when the new type picks from the same tier as before (a type of the same group), else it goes.
      Stamps also get the new type's anchor when it locks one, and its default anchor when the element is brand-new or its
      old type locked the anchor (that anchor was never the user's choice); otherwise they keep their anchor.
      Picking a type drops `typeGroup` (the group then comes from the type). */
  function chooseType(el, layer, typeId, vocab) {
    const out = Object.assign({}, el);
    const oldType = elementTypeOf(el, layer, vocab);
    const isNew = el.typeId == null && hasDefaultName(el, layer);
    if (!typeId) {
      out.typeId = null;
      delete out.typeGroup;
      delete out.tier;
      resetLockedAnchor(out, oldType, layer);
      return out;
    }
    const t = findType(vocab, layer, typeId);
    if (!t) return out;
    out.typeId = t.id;
    delete out.typeGroup;
    keepTierIfSame(out, tierOf(el, layer, vocab), tierOfType(vocab, layer, t));
    if (isNew) {
      out.name = autoNameOf(out, layer, vocab, true);
      out.color = t.color;
      if (layer === "stamp") out.emoji = t.emoji;
    }
    if (layer === "stamp" && (t.anchorLocked || isNew || (oldType && oldType.anchorLocked) || !isStampAnchor(el.anchor))) {
      out.anchor = defaultStampAnchor(t);
    }
    return out;
  }

  /** Copy of the element after picking tier value `valueId` ("" clears it). A value that isn't in the tier the element
      picks from changes nothing. An element still named by the editor (autoNameOf, with or without its old tier value:
      "钱盒", "钱盒·中") is renamed to match ("钱盒·大"); a name the user typed is kept. */
  function chooseTier(el, layer, valueId, vocab) {
    const out = Object.assign({}, el);
    if (!valueId) delete out.tier;
    else if ((tierOf(el, layer, vocab)?.values || []).some((v) => v.id === valueId)) out.tier = valueId;
    else return out;
    const named = autoNameOf(el, layer, vocab, false);
    if (named !== null && (el.name === named || el.name === autoNameOf(el, layer, vocab, true))) out.name = autoNameOf(out, layer, vocab, true);
    return out;
  }

  /* ── editing the stamp categories ─────────────────────────────────
     Every edit returns a new document; the input is left as it is. Ids never change: a rename edits only a label, so
     stamps are untouched. After the edit the stamps are repaired (repairStamps). Emoji and colour edits don't reach
     placed stamps: a stamp takes them only when it is brand-new and picks the type (chooseType). */

  /** Ids a group, type or tier value the designer adds must not take (the panel draws a random one outside them, see
      newCategoryId in src/util.ts): the document's groups, types and tier values, and the ids its stamps still hold
      (typeId, typeGroup, tier), so a stamp left with a deleted id never ends up on a new entry. */
  function usedCategoryIds(doc) {
    const c = (doc && doc.stampCategories) || EMPTY_CATEGORIES;
    const used = new Set();
    for (const x of [...c.groups, ...c.types]) {
      used.add(x.id);
      for (const v of (x.tier && x.tier.values) || []) used.add(v.id);
    }
    for (const st of (doc && doc.stamps) || []) for (const id of [st.typeId, st.typeGroup, st.tier]) if (isId(id)) used.add(id);
    return used;
  }

  /** Clears, on every stamp of `out`, each id that named something in `before`'s categories and no longer does in
      `out`'s:
      - its type gone: typeId null; it keeps the type's group (typeGroup) when that group is still there, so it is
        未选完, else it is 未分类; a type that locked the anchor leaves SnapToGround behind (as chooseType does);
      - its group gone (a group-only stamp): typeGroup removed;
      - its tier value no longer a value of the tier it now picks from: tier removed.
      Ids that were already unknown before the edit stay as they are. Anchors end up as stampAnchorOf says, so a locked
      type's anchor change reaches its stamps. */
  function repairStamps(before, out) {
    const vb = vocabOf(before);
    const va = vocabOf(out);
    for (const st of out.stamps || []) {
      const oldType = elementTypeOf(st, "stamp", vb);
      const oldGroup = typeGroupOf(st, "stamp", vb);
      const oldValue = tierValueOf(st, "stamp", vb);
      if (oldType && !findType(va, "stamp", oldType.id)) {
        st.typeId = null;
        if (oldGroup && findGroup(va, "stamp", oldGroup.id)) st.typeGroup = oldGroup.id;
        if (oldType.anchorLocked) st.anchor = defaultStampAnchor(null);
      } else if (!oldType && oldGroup && !findGroup(va, "stamp", oldGroup.id)) {
        delete st.typeGroup;
      }
      if (oldValue && !tierValueOf(st, "stamp", va)) delete st.tier;
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

  /** The group or group-less type a tier hangs on. `owner` is { group: id } or { type: id }; a type inside a group has
      no tier of its own (it picks from its group's), so it gives null, as does an id the categories don't have. */
  function tierOwnerIn(c, owner) {
    if (!owner) return null;
    if (owner.group != null) return findIn(c.groups, owner.group);
    const t = findIn(c.types, owner.type);
    return t && !findIn(c.groups, t.group) ? t : null;
  }

  /** tierOwnerIn on the document's categories: the entry the panel shows a tier for (the same one the edits change). */
  const stampTierOwner = (doc, owner) => tierOwnerIn((doc && doc.stampCategories) || EMPTY_CATEGORIES, owner);

  /* ── renaming ids ─────────────────────────────────────────────────
     A designer may give an entry they added a readable id (`Type_k3x9qa` -> `TreasureChest`): the UE side configures
     placeholders and generation by typeId and tier value id, and names icons after the typeId. Ids that are in the
     default categories (mvmap-types.js defaultStampCategories) are locked: the UE side is configured for them. When
     the UE side starts to support a type a designer added, it goes into the defaults, which locks it too.
     `ref` names the entry: { group }, { type }, or a tier value { group | type (its tier's owner), value }. */

  /** Letters, digits and `_`, starting with a letter: usable as a UE config key and in an asset name. */
  const ID_TEXT = /^[A-Za-z][A-Za-z0-9_]*$/;

  /** The entry `ref` names in categories `c`, the list it is unique in, and for a tier value its tier; null when there
      is none. */
  function refEntry(c, ref) {
    if (ref.value != null) {
      const o = tierOwnerIn(c, ref);
      const v = o && o.tier && findIn(o.tier.values, ref.value);
      return v ? { kind: "value", entry: v, siblings: o.tier.values, tier: o.tier } : null;
    }
    if (ref.type != null) {
      const t = findIn(c.types, ref.type);
      return t ? { kind: "type", entry: t, siblings: c.types } : null;
    }
    const g = findIn(c.groups, ref.group);
    return g ? { kind: "group", entry: g, siblings: c.groups } : null;
  }

  /** Whether the entry's id is one of the default categories' (at the same place: a tier value of the same owner). */
  const isCategoryIdLocked = (ref, defaults) => !!refEntry(defaults || EMPTY_CATEGORIES, ref);

  /** Why the entry can't be renamed to `id`, or null when it can (an unchanged id included): "missing" (no such
      entry), "locked" (isCategoryIdLocked), "format" (not ID_TEXT), "taken" (another entry of the same list has it, or
      a stamp still holds it as a stale id there: a stamp's typeId, a group-only stamp's typeGroup, or the tier value
      of a stamp picking from the same tier; that stamp would otherwise end up on the renamed entry). */
  function categoryIdProblem(doc, ref, id, defaults) {
    const hit = refEntry(vocabOf(doc).stamp, ref);
    if (!hit) return "missing";
    if (id === hit.entry.id) return null;
    if (isCategoryIdLocked(ref, defaults)) return "locked";
    if (typeof id !== "string" || !ID_TEXT.test(id)) return "format";
    if (hit.siblings.some((x) => x.id === id)) return "taken";
    const v = vocabOf(doc);
    const holds = (st) =>
      hit.kind === "type" ? st.typeId === id : hit.kind === "group" ? st.typeGroup === id : st.tier === id && tierOf(st, "stamp", v) === hit.tier;
    return (doc.stamps || []).some(holds) ? "taken" : null;
  }

  /** Copy of the document with the entry's id changed to `id`, and every reference to it: a group's types and its
      group-only stamps' typeGroup; a type's stamps' typeId; a tier value on the stamps picking it from that tier.
      Changes nothing when categoryIdProblem objects. */
  function renameCategoryId(doc, ref, id, defaults) {
    const out = clone(doc);
    if (categoryIdProblem(doc, ref, id, defaults)) return out;
    const before = refEntry(vocabOf(doc).stamp, ref);
    const hit = refEntry(out.stampCategories, ref);
    const old = hit.entry.id;
    const v = vocabOf(doc);
    (doc.stamps || []).forEach((st, i) => {
      const o = out.stamps[i];
      if (hit.kind === "type" && st.typeId === old) o.typeId = id;
      if (hit.kind === "group" && st.typeGroup === old) o.typeGroup = id;
      if (hit.kind === "value" && st.tier === old && tierOf(st, "stamp", v) === before.tier) o.tier = id;
    });
    if (hit.kind === "group") for (const t of out.stampCategories.types) if (t.group === old) t.group = id;
    hit.entry.id = id;
    return out;
  }

  /** New group with no types and no tier, added last. An id already used by a group changes nothing. */
  function addStampGroup(doc, id, label) {
    return editCategories(doc, (c) => {
      if (isId(id) && !findIn(c.groups, id)) c.groups.push({ id, label: String(label) });
    });
  }

  /** New type, added last: `fields` gives label, emoji, color, and optionally anchor, anchorLocked and group (an id the
      categories don't have is left out). A type the designer adds is `manual` (only a placeholder) until UE knows it.
      An id already used by a type changes nothing. */
  function addStampType(doc, id, fields) {
    return editCategories(doc, (c) => {
      if (!isId(id) || findIn(c.types, id)) return;
      const f = fields || {};
      const t = { id, label: String(f.label ?? id), generate: "manual", color: String(f.color ?? "#888888"), emoji: String(f.emoji ?? "") };
      if (findIn(c.groups, f.group)) t.group = f.group;
      if (isStampAnchor(f.anchor)) t.anchor = f.anchor;
      if (f.anchorLocked) t.anchorLocked = true;
      c.types.push(t);
    });
  }

  /** Fields of a type the panel edits. id, group (moveStampType), tier (the tier edits) and generate (a UE-side fact)
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

  /** Group with `patch` ({ label }) applied: a group has only its name to edit. */
  function updateStampGroup(doc, id, patch) {
    return editCategories(doc, (c) => {
      const g = findIn(c.groups, id);
      if (g && patch && "label" in patch) g.label = String(patch.label);
    });
  }

  /** Type with `patch` ({ label, emoji, color, anchor, anchorLocked }, any of them) applied. Placed stamps keep their
      emoji and colour; a type that locks its anchor sets its stamps' anchor. */
  function updateStampType(doc, id, patch) {
    return editCategories(doc, (c) => {
      const t = findIn(c.types, id);
      if (t) patchType(t, patch);
    });
  }

  /** Type moved into group `groupId` ("" or null: out of any group), placed last among the group's types. Its stamps
      lose a tier value the tier they now pick from doesn't have ("未选<tier>"). A type moving into a group drops its own
      tier: inside a group it picks from the group's. The type's own group, or a group id the categories don't have,
      changes nothing. */
  function moveStampType(doc, id, groupId) {
    return editCategories(doc, (c) => {
      const t = findIn(c.types, id);
      if (!t || (groupId && !findIn(c.groups, groupId)) || (findIn(c.groups, t.group)?.id ?? "") === (groupId || "")) return;
      if (groupId) {
        t.group = groupId;
        delete t.tier;
      } else delete t.group;
      c.types.splice(c.types.indexOf(t), 1);
      c.types.push(t);
    });
  }

  /** Type deleted. Its stamps keep its group (未选小类) when it had one, else become 未分类 (repairStamps). */
  function removeStampType(doc, id) {
    return editCategories(doc, (c) => {
      c.types = c.types.filter((t) => t.id !== id);
    });
  }

  /** Group deleted with every type inside it. Their stamps, and the group-only ones, become 未分类. */
  function removeStampGroup(doc, id) {
    return editCategories(doc, (c) => {
      if (!findIn(c.groups, id)) return;
      c.groups = c.groups.filter((g) => g.id !== id);
      c.types = c.types.filter((t) => t.group !== id);
    });
  }

  /** Tier of `owner` ({ group } or { type } without a group) named `label`; created with no values when it has none.
      Defining a tier makes the owner's stamps 未选完 until they pick a value. */
  function setStampTier(doc, owner, label) {
    return editCategories(doc, (c) => {
      const o = tierOwnerIn(c, owner);
      if (!o) return;
      if (o.tier) o.tier.label = String(label);
      else o.tier = { label: String(label), values: [] };
    });
  }

  /** Tier of `owner` deleted; its stamps lose their tier value. */
  function removeStampTier(doc, owner) {
    return editCategories(doc, (c) => {
      const o = tierOwnerIn(c, owner);
      if (o) delete o.tier;
    });
  }

  /** New value, last in `owner`'s tier. An id the tier already has changes nothing. */
  function addTierValue(doc, owner, id, label) {
    return editCategories(doc, (c) => {
      const o = tierOwnerIn(c, owner);
      if (o && o.tier && isId(id) && !findIn(o.tier.values, id)) o.tier.values.push({ id, label: String(label) });
    });
  }

  /** Tier value renamed. */
  function renameTierValue(doc, owner, id, label) {
    return editCategories(doc, (c) => {
      const o = tierOwnerIn(c, owner);
      const v = o && o.tier && findIn(o.tier.values, id);
      if (v) v.label = String(label);
    });
  }

  /** Tier value deleted; the stamps that had it become "未选<tier>". */
  function removeTierValue(doc, owner, id) {
    return editCategories(doc, (c) => {
      const o = tierOwnerIn(c, owner);
      if (o && o.tier) o.tier.values = o.tier.values.filter((v) => v.id !== id);
    });
  }

  /** How many stamps a delete would change, for "N 个元素在用". `ref`:
      - { group }: stamps of the group (of its types, or only the group picked);
      - { type }: stamps of the type;
      - { group | type, tier: true }: stamps with a value of that owner's tier;
      - { group | type, value }: stamps with that value of the owner's tier.
      Counts stamps (a stamp's placed copies count once). */
  function countStampsUsing(doc, ref) {
    const v = vocabOf(doc);
    const c = v.stamp;
    const owner = ref.value != null || ref.tier ? tierOwnerIn(c, ref) : null;
    const uses = (st) => {
      if (ref.value != null || ref.tier) {
        const val = owner && owner.tier && tierOf(st, "stamp", v) === owner.tier ? tierValueOf(st, "stamp", v) : null;
        return !!val && (ref.tier || val.id === ref.value);
      }
      if (ref.type != null) return elementTypeOf(st, "stamp", v)?.id === ref.type;
      return typeGroupOf(st, "stamp", v)?.id === ref.group;
    };
    return (doc.stamps || []).filter(uses).length;
  }

  return {
    usedCategoryIds, stampTierOwner, isCategoryIdLocked, categoryIdProblem, renameCategoryId, addStampGroup, addStampType, updateStampGroup, updateStampType, moveStampType, removeStampType,
    removeStampGroup, setStampTier, removeStampTier, addTierValue, renameTierValue, removeTierValue, countStampsUsing,
    roomCode, parseRoomNumber, findUeFieldErrors, buildExportDoc, findRegion,
    vocabOf, fillStampCategories, stampCategoryProblems, migrateTypeData,
    typesForLayer, elementTypeOf, migrateTypeIds, defaultElementName, chooseType, manualMarkOf,
    typePickerEntries, groupMembers, typeGroupOf, chooseTypeGroup,
    tierOf, tierValueOf, chooseTier, elementStatusOf, statusLabelOf,
    STAMP_ANCHORS, defaultStampAnchor, isStampAnchorLocked, stampAnchorOf, migrateStampAnchors,
  };
});
