/* Pure helpers for the fields the UE whitebox importer reads: area region, room number, element typeId, export shape.
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
      structures/edgeStructs/stamps keep typeId only when it names a type of their layer (unclassified = no typeId field). */
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
      - every element without a typeId field gets one if its name is exactly a type label, or an old label (`oldLabels`), of its layer.
      Other typeIds are kept as-is, including ones the vocabulary doesn't know and null (created in the editor, or 未分类 picked by hand). */
  function migrateTypeIds(doc, types) {
    const out = JSON.parse(JSON.stringify(doc));
    for (const [list, layer] of ELEMENT_LAYERS) {
      const layerTypes = typesForLayer(types, layer);
      for (const el of out[list] || []) {
        if (el.typeId === undefined) {
          const t = layerTypes.find((x) => x.label === el.name || (x.oldLabels || []).includes(el.name));
          if (t) el.typeId = t.id;
        } else if (el.typeId != null && !layerTypes.some((x) => x.id === el.typeId)) {
          const renamed = layerTypes.find((x) => (x.oldIds || []).includes(el.typeId));
          if (renamed) el.typeId = renamed.id;
        }
      }
    }
    return out;
  }

  /** Name the editor gives the n-th new element of a layer, before the user renames it or picks a type. */
  const DEFAULT_NAME_PREFIX = { structure: "Structure ", edge: "Platform ", stamp: "Stamp " };
  const defaultElementName = (layer, n) => DEFAULT_NAME_PREFIX[layer] + n;
  const hasDefaultName = (el, layer) => new RegExp("^" + DEFAULT_NAME_PREFIX[layer] + "\\d+$").test(el.name);

  /** Copy of the element after picking `typeId` in its Type dropdown ("" = 未分类, stored as null so loading never re-guesses it).
      A brand-new element (typeId null or missing, default name) also takes the type's name and colour, and its emoji on stamps.
      An id that isn't a type of this layer (the dropdown's "unknown: …" entry) changes nothing. */
  function chooseType(el, layer, typeId, types) {
    const out = Object.assign({}, el);
    if (!typeId) { out.typeId = null; return out; }
    const t = typesForLayer(types, layer).find((x) => x.id === typeId);
    if (!t) return out;
    if (el.typeId == null && hasDefaultName(el, layer)) {
      out.name = t.label;
      out.color = t.color;
      if (layer === "stamp") out.emoji = t.emoji;
    }
    out.typeId = t.id;
    return out;
  }

  return {
    roomCode, parseRoomNumber, findUeFieldErrors, buildExportDoc, findRegion,
    typesForLayer, elementTypeOf, migrateTypeIds, defaultElementName, chooseType, manualMarkOf,
  };
});
