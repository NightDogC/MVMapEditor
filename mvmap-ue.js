/* Pure helpers for the fields the UE whitebox importer reads: area region, room number, element typeId, stamp anchor,
   export shape.
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

  /** Copy of the document as written to .mvmap.json: every area gets region + letter, every room gets number (null = unset),
      structures/edgeStructs/stamps keep typeId only when it names a type of their layer (unclassified = no typeId field),
      every stamp gets its anchor (stampAnchorOf: a type that locks its anchor overrides the element's). Stamp points keep
      their id as stored. */
  function buildExportDoc(doc, regions, types) {
    const out = JSON.parse(JSON.stringify(doc));
    for (const a of out.areas || []) {
      if (a.region == null) a.region = null;
      const reg = findRegion(regions, a.region);
      a.letter = reg ? reg.letter : null;
    }
    for (const r of out.rooms || []) r.number = isRoomNumber(r.number) ? r.number : null;
    for (const [list, layer] of ELEMENT_LAYERS) {
      for (const el of out[list] || []) if (!elementTypeOf(el, layer, types)) delete el.typeId;
    }
    for (const st of out.stamps || []) st.anchor = stampAnchorOf(st, types);
    return out;
  }

  /** Values of a stamp element's anchor, as the UE importer reads them: SnapToGround (on the ground) / FloatInAir. */
  const STAMP_ANCHORS = ["SnapToGround", "FloatInAir"];
  const isStampAnchor = (v) => STAMP_ANCHORS.includes(v);

  /** Anchor a stamp of this type starts with: the type's `anchor`, else SnapToGround (also for no type). */
  const defaultStampAnchor = (type) => (type && isStampAnchor(type.anchor) ? type.anchor : "SnapToGround");

  /** Whether the stamp's type fixes its anchor (`anchorLocked`); the inspector then hides the anchor dropdown. */
  const isStampAnchorLocked = (st, types) => {
    const t = elementTypeOf(st, "stamp", types);
    return !!(t && t.anchorLocked);
  };

  /** The stamp's effective anchor: its type's when the type locks it, else its own, else the type's default. */
  function stampAnchorOf(st, types) {
    const t = elementTypeOf(st, "stamp", types);
    if (t && t.anchorLocked) return defaultStampAnchor(t);
    return isStampAnchor(st.anchor) ? st.anchor : defaultStampAnchor(t);
  }

  /** Copy of the document where every stamp's anchor is its effective one (stampAnchorOf): missing or unknown anchors get
      the type's default, locked types get theirs. Run after migrateTypeIds, so renamed types give the right default. */
  function migrateStampAnchors(doc, types) {
    const out = JSON.parse(JSON.stringify(doc));
    for (const st of out.stamps || []) st.anchor = stampAnchorOf(st, types);
    return out;
  }

  /** Element types offered in a layer's "Type" dropdown. layer: "structure" | "edge" | "stamp". */
  const typesForLayer = (types, layer) => types.filter((t) => t.layer === layer);

  /** The element's type, or null when it is unclassified (no typeId, an id not in the vocabulary, or a type for another layer). */
  const elementTypeOf = (el, layer, types) =>
    (el && el.typeId != null && types.find((t) => t.id === el.typeId && t.layer === layer)) || null;

  /** Map marker for an element the UE importer won't generate: "manual" (placed by hand), "unclassified" (no usable type,
      so the importer only leaves a placeholder for it too), or null for auto types. */
  function manualMarkOf(el, layer, types) {
    const t = elementTypeOf(el, layer, types);
    if (!t) return "unclassified";
    return t.generate === "manual" ? "manual" : null;
  }

  /** Document list -> the vocabulary layer its elements use. */
  const ELEMENT_LAYERS = [
    ["structures", "structure"],
    ["edgeStructs", "edge"],
    ["stamps", "stamp"],
  ];

  /** Copy of the document where
      - every element whose typeId is a renamed type's old id (its `oldIds`, same layer) gets the current id;
      - every element whose typeId is the old id of a split type (`groupOldIds`: { id, layer, group }) gets typeId null and
        typeGroup set to that group, when its layer has the group: it stays unclassified, with the group already picked;
      - every element without a typeId field gets one if its name is exactly a type label, or an old label (`oldLabels`), of its layer,
        unless it has a typeGroup (a group-only element exported without typeId: the group was picked on purpose).
      Other typeIds are kept as-is, including ones the vocabulary doesn't know and null (created in the editor, or 未分类 picked by hand). */
  function migrateTypeIds(doc, types, groupOldIds) {
    const out = JSON.parse(JSON.stringify(doc));
    for (const [list, layer] of ELEMENT_LAYERS) {
      const layerTypes = typesForLayer(types, layer);
      for (const el of out[list] || []) {
        if (el.typeId === undefined) {
          if (el.typeGroup != null) continue;
          const t = layerTypes.find((x) => x.label === el.name || (x.oldLabels || []).includes(el.name));
          if (t) el.typeId = t.id;
        } else if (el.typeId != null && !layerTypes.some((x) => x.id === el.typeId)) {
          const renamed = layerTypes.find((x) => (x.oldIds || []).includes(el.typeId));
          const split = (groupOldIds || []).find((x) => x.layer === layer && x.id === el.typeId && layerHasGroup(types, layer, x.group));
          if (renamed) el.typeId = renamed.id;
          else if (split) {
            el.typeId = null;
            el.typeGroup = split.group;
          }
        }
      }
    }
    return out;
  }

  const layerHasGroup = (types, layer, group) => typesForLayer(types, layer).some((t) => t.group === group);

  /** A stamp leaving a type that locked its anchor gets SnapToGround back: that anchor was never the user's choice. */
  function resetLockedAnchor(out, oldType, layer) {
    if (layer === "stamp" && oldType && oldType.anchorLocked) out.anchor = defaultStampAnchor(null);
  }

  /** Entries of a layer's first-level "Type" dropdown, in vocabulary order: { type } for a type without `group`, and
      { group, types } for a group, placed where its first type is. A layer without groups gets only { type } entries. */
  function typePickerEntries(types, layer) {
    const entries = [];
    for (const t of typesForLayer(types, layer)) {
      if (!t.group) entries.push({ type: t });
      else if (!entries.some((e) => e.group === t.group)) {
        entries.push({ group: t.group, types: typesForLayer(types, layer).filter((x) => x.group === t.group) });
      }
    }
    return entries;
  }

  /** The element's group in the two-level picker: its type's group when it has a type; otherwise its `typeGroup` when
      that is a group of the layer (picked without a type inside it yet); else null. */
  function typeGroupOf(el, layer, types) {
    const t = elementTypeOf(el, layer, types);
    if (t) return t.group || null;
    const g = el && el.typeGroup;
    return g && layerHasGroup(types, layer, g) ? g : null;
  }

  /** The group of an element that has a group but no type inside it yet (shown red as "钱盒（未选小类）"), else null. */
  const pendingTypeGroupOf = (el, layer, types) => (elementTypeOf(el, layer, types) ? null : typeGroupOf(el, layer, types));

  /** Copy of the element after picking `group` in the first-level dropdown without a type inside it: typeId null (still
      unclassified, exported without typeId), typeGroup = group. Name and colour stay, so a brand-new element still takes
      the type's name when its type is picked. "" is 未分类 by hand (as chooseType ""). The element's own group, or a group
      the layer doesn't have, changes nothing. A stamp leaving a type that locked its anchor gets SnapToGround back. */
  function chooseTypeGroup(el, layer, group, types) {
    if (!group) return chooseType(el, layer, "", types);
    const out = Object.assign({}, el);
    if (group === typeGroupOf(el, layer, types) || !layerHasGroup(types, layer, group)) return out;
    out.typeId = null;
    out.typeGroup = group;
    resetLockedAnchor(out, elementTypeOf(el, layer, types), layer);
    return out;
  }

  /** Name the editor gives the n-th new element of a layer, before the user renames it or picks a type. */
  const DEFAULT_NAME_PREFIX = { structure: "Structure ", edge: "Platform ", stamp: "Stamp " };
  const defaultElementName = (layer, n) => DEFAULT_NAME_PREFIX[layer] + n;
  const hasDefaultName = (el, layer) => new RegExp("^" + DEFAULT_NAME_PREFIX[layer] + "\\d+$").test(el.name);

  /** Copy of the element after picking `typeId` in its Type dropdown ("" = 未分类, stored as null so loading never re-guesses it).
      A brand-new element (typeId null or missing, default name) also takes the type's name and colour, and its emoji on stamps.
      An id that isn't a type of this layer (the dropdown's "unknown: …" entry) changes nothing.
      Stamps also get the new type's anchor when it locks one, and its default anchor when the element is brand-new or its
      old type locked the anchor (that anchor was never the user's choice); otherwise they keep their anchor.
      Picking a type or 未分类 drops `typeGroup` (a group picked on its own, see chooseTypeGroup). */
  function chooseType(el, layer, typeId, types) {
    const out = Object.assign({}, el);
    const oldType = elementTypeOf(el, layer, types);
    const isNew = el.typeId == null && hasDefaultName(el, layer);
    if (!typeId) {
      out.typeId = null;
      delete out.typeGroup;
      resetLockedAnchor(out, oldType, layer);
      return out;
    }
    const t = typesForLayer(types, layer).find((x) => x.id === typeId);
    if (!t) return out;
    if (isNew) {
      out.name = t.label;
      out.color = t.color;
      if (layer === "stamp") out.emoji = t.emoji;
    }
    out.typeId = t.id;
    delete out.typeGroup;
    if (layer === "stamp" && (t.anchorLocked || isNew || (oldType && oldType.anchorLocked) || !isStampAnchor(el.anchor))) {
      out.anchor = defaultStampAnchor(t);
    }
    return out;
  }

  return {
    roomCode, parseRoomNumber, findUeFieldErrors, buildExportDoc, findRegion,
    typesForLayer, elementTypeOf, migrateTypeIds, defaultElementName, chooseType, manualMarkOf,
    typePickerEntries, typeGroupOf, pendingTypeGroupOf, chooseTypeGroup,
    STAMP_ANCHORS, defaultStampAnchor, isStampAnchorLocked, stampAnchorOf, migrateStampAnchors,
  };
});
