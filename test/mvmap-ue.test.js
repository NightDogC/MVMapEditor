"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const UE = require("../mvmap-ue.js");

test("roomCode pads the number to two digits after the region letter", () => {
  assert.equal(UE.roomCode("B", 1), "B01");
  assert.equal(UE.roomCode("A", 12), "A12");
  assert.equal(UE.roomCode("C", 105), "C105");
});

test("roomCode is empty when the region letter or the number is missing", () => {
  assert.equal(UE.roomCode(null, 3), "");
  assert.equal(UE.roomCode("B", null), "");
  assert.equal(UE.roomCode(undefined, undefined), "");
});

test("parseRoomNumber accepts positive integers, ignoring surrounding spaces and leading zeros", () => {
  assert.deepEqual(UE.parseRoomNumber("3"), { value: 3, error: null });
  assert.deepEqual(UE.parseRoomNumber(" 07 "), { value: 7, error: null });
});

test("parseRoomNumber treats a blank field as unset, not as an error", () => {
  assert.deepEqual(UE.parseRoomNumber(""), { value: null, error: null });
  assert.deepEqual(UE.parseRoomNumber("   "), { value: null, error: null });
});

test("parseRoomNumber rejects zero, negatives, decimals and non-digits", () => {
  for (const bad of ["0", "00", "-1", "1.5", "abc", "1e2", "+2", "2a"]) {
    const r = UE.parseRoomNumber(bad);
    assert.equal(r.value, null, bad);
    assert.ok(r.error, "expected an error for " + JSON.stringify(bad));
  }
});

const REGIONS = [
  { label: "A_傩愿寨", region: "NuoYuanZhai", letter: "A" },
  { label: "B_先祖祠", region: "XianZuCi", letter: "B" },
];

function sampleDoc() {
  return {
    areas: [
      { id: "a1", name: "祠堂", color: "#fff", region: "XianZuCi" },
      { id: "a2", name: "寨子", color: "#000" },
    ],
    rooms: [
      { id: "r1", name: "中堂", areaId: "a1", cells: ["0,0"], number: 1 },
      { id: "r2", name: "左殿", areaId: "a1", cells: ["1,0"], number: 2 },
      { id: "r3", name: "山路", areaId: "a2", cells: ["5,5"], number: 1 },
      { id: "r4", name: "未编号", areaId: "a2", cells: ["6,5"] },
    ],
  };
}

test("findUeFieldErrors is empty when numbers are unique per area, even if areas reuse a number", () => {
  assert.deepEqual(UE.findUeFieldErrors(sampleDoc(), REGIONS), []);
});

test("findUeFieldErrors reports rooms sharing a number inside one area, naming the area and the rooms", () => {
  const d = sampleDoc();
  d.rooms[1].number = 1;
  const errs = UE.findUeFieldErrors(d, REGIONS);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /祠堂/);
  assert.match(errs[0], /中堂/);
  assert.match(errs[0], /左殿/);
  assert.match(errs[0], /\b1\b/);
});

test("findUeFieldErrors reports a stored number that is not a positive integer", () => {
  const d = sampleDoc();
  d.rooms[0].number = 0;
  d.rooms[1].number = "2";
  const errs = UE.findUeFieldErrors(d, REGIONS);
  assert.equal(errs.length, 2);
  assert.match(errs[0], /中堂/);
  assert.match(errs[1], /左殿/);
});

test("findUeFieldErrors reports an area region that is not in the region list", () => {
  const d = sampleDoc();
  d.areas[1].region = "NoSuchRegion";
  const errs = UE.findUeFieldErrors(d, REGIONS);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /寨子/);
  assert.match(errs[0], /NoSuchRegion/);
});

test("buildExportDoc adds region, letter and number, writing null for anything unset", () => {
  const out = UE.buildExportDoc(sampleDoc(), REGIONS);
  assert.equal(out.areas[0].region, "XianZuCi");
  assert.equal(out.areas[0].letter, "B");
  assert.equal(out.areas[1].region, null);
  assert.equal(out.areas[1].letter, null);
  assert.deepEqual(out.rooms.map((r) => r.number), [1, 2, 1, null]);
});

test("buildExportDoc keeps every existing field and leaves the editor document untouched", () => {
  const doc = sampleDoc();
  doc.name = "Map";
  doc.doors = [{ id: "d1", x: 1, y: 0, o: "v" }];
  const before = JSON.parse(JSON.stringify(doc));
  const out = UE.buildExportDoc(doc, REGIONS);
  assert.deepEqual(doc, before);
  assert.equal(out.name, "Map");
  assert.deepEqual(out.doors, before.doors);
  assert.deepEqual(out.areas[1], { id: "a2", name: "寨子", color: "#000", region: null, letter: null });
  assert.deepEqual(out.rooms[3], { id: "r4", name: "未编号", areaId: "a2", cells: ["6,5"], number: null });
});

test("buildExportDoc exports an invalid stored number as null and an unknown region without a letter", () => {
  const d = sampleDoc();
  d.rooms[0].number = 0;
  d.areas[1].region = "NoSuchRegion";
  const out = UE.buildExportDoc(d, REGIONS);
  assert.equal(out.rooms[0].number, null);
  assert.equal(out.areas[1].region, "NoSuchRegion");
  assert.equal(out.areas[1].letter, null);
});

test("roomCode is empty for a stored number that is not a positive integer", () => {
  assert.equal(UE.roomCode("B", 0), "");
  assert.equal(UE.roomCode("B", "2"), "");
  assert.equal(UE.roomCode("B", 1.5), "");
});
