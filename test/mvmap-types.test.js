"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const TYPES = require("../mvmap-types.js");

test("every region has a unique enum name and letter, and the letter matches its label prefix", () => {
  const regions = TYPES.regions;
  assert.ok(regions.length > 0);
  assert.equal(new Set(regions.map((r) => r.region)).size, regions.length);
  assert.equal(new Set(regions.map((r) => r.letter)).size, regions.length);
  for (const r of regions) {
    assert.match(r.region, /^[A-Za-z]+$/, r.region);
    assert.match(r.letter, /^[A-Z]$/, r.region);
    assert.ok(r.label.startsWith(r.letter + "_"), r.label);
  }
});

test("every element type has a unique id, a known layer and generate mode, a colour and an emoji", () => {
  const types = TYPES.types;
  assert.ok(types.length > 0);
  assert.equal(new Set(types.map((t) => t.id)).size, types.length);
  for (const t of types) {
    assert.match(t.id, /^[A-Z][A-Za-z]*$/, t.id);
    assert.ok(typeof t.label === "string" && t.label.trim() === t.label && t.label !== "", t.id);
    assert.ok(["structure", "edge", "stamp"].includes(t.layer), t.id);
    assert.ok(["auto", "manual"].includes(t.generate), t.id);
    assert.match(t.color, /^#[0-9a-f]{6}$/i, t.id);
    assert.ok(typeof t.emoji === "string" && t.emoji !== "", t.id);
  }
});

test("labels are unique within a layer, so a name can only ever match one type", () => {
  for (const layer of ["structure", "edge", "stamp"]) {
    const labels = TYPES.types.filter((t) => t.layer === layer).map((t) => t.label);
    assert.equal(new Set(labels).size, labels.length, layer);
  }
});

test("the importer's auto types are Wall, DamageTerrain (structures) and JumpOffPlatform (edges); every stamp is manual", () => {
  const auto = TYPES.types.filter((t) => t.generate === "auto").map((t) => `${t.layer}:${t.id}`).sort();
  assert.deepEqual(auto, ["edge:JumpOffPlatform", "structure:DamageTerrain", "structure:Wall"]);
  assert.ok(TYPES.types.some((t) => t.layer === "stamp"));
});
