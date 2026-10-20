/* Pure helpers for the fields the UE whitebox importer reads: area region, room number, export shape.
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

  /** Copy of the document as written to .mvmap.json: every area gets region + letter, every room gets number (null = unset). */
  function buildExportDoc(doc, regions) {
    const out = JSON.parse(JSON.stringify(doc));
    for (const a of out.areas || []) {
      if (a.region == null) a.region = null;
      const reg = findRegion(regions, a.region);
      a.letter = reg ? reg.letter : null;
    }
    for (const r of out.rooms || []) r.number = isRoomNumber(r.number) ? r.number : null;
    return out;
  }

  return { roomCode, parseRoomNumber, findUeFieldErrors, buildExportDoc, findRegion };
});
