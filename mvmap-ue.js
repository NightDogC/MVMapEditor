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

  /** The vocabulary of a document: the fixed structure / edge types plus the document's stamp categories. */
  const vocabOf = (doc, types) => ({ types: types || [], stamp: (doc && doc.stampCategories) || EMPTY_CATEGORIES });

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const isId = (v) => typeof v === "string" && v !== "";

  /** Entries of a list that are objects with a string id, first one of each id kept. */
  function withIds(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter((x) => isObj(x) && isId(x.id) && !seen.has(x.id) && seen.add(x.id));
  }
  function cleanTier(tier) {
    if (!isObj(tier)) return undefined;
    const values = withIds(tier.values).map((v) => ({ ...v, label: typeof v.label === "string" ? v.label : v.id }));
    return { ...tier, label: typeof tier.label === "string" ? tier.label : "档位", values };
  }
  function cleanCategory(x) {
    const out = { ...x, label: typeof x.label === "string" ? x.label : x.id };
    const tier = cleanTier(x.tier);
    if (tier) out.tier = tier;
    else delete out.tier;
    return out;
  }
  /** A type with every field the editor reads; a type the designer adds is placed by hand (`manual`) until UE knows it. */
  function cleanType(x) {
    const out = cleanCategory(x);
    if (typeof out.emoji !== "string") out.emoji = "";
    if (typeof out.color !== "string") out.color = "#888888";
    if (out.generate !== "auto" && out.generate !== "manual") out.generate = "manual";
    return out;
  }

  /** Copy of the document with stamp categories: its own when it has them (entries without an id, repeated ids and
      malformed tiers dropped, missing fields filled, so a hand-edited file can't break the editor), else a copy of
      `defaults`. */
  function fillStampCategories(doc, defaults) {
    const out = JSON.parse(JSON.stringify(doc));
    const c = isObj(out.stampCategories) ? out.stampCategories : JSON.parse(JSON.stringify(defaults || EMPTY_CATEGORIES));
    out.stampCategories = { ...c, groups: withIds(c.groups).map(cleanCategory), types: withIds(c.types).map(cleanType) };
    return out;
  }

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
      old ids -> stamp anchors. `vocabulary` is mvmap-types.js. */
  function migrateTypeData(doc, vocabulary) {
    const withCategories = fillStampCategories(doc, vocabulary.defaultStampCategories);
    return migrateStampAnchors(migrateTypeIds(withCategories, vocabulary.types, vocabulary.oldStampIds), vocabulary.types);
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

  return {
    roomCode, parseRoomNumber, findUeFieldErrors, buildExportDoc, findRegion,
    vocabOf, fillStampCategories, migrateTypeData,
    typesForLayer, elementTypeOf, migrateTypeIds, defaultElementName, chooseType, manualMarkOf,
    typePickerEntries, groupMembers, typeGroupOf, chooseTypeGroup,
    tierOf, tierValueOf, chooseTier, elementStatusOf, statusLabelOf,
    STAMP_ANCHORS, defaultStampAnchor, isStampAnchorLocked, stampAnchorOf, migrateStampAnchors,
  };
});
