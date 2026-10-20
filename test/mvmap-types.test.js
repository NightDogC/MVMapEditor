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
