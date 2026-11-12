// Stamp point ids while editing: placing gives a new id, dragging keeps it, placing on another stamp's point deletes
// that point (and its id), a moved room carries its stamps' ids along.
import test from "node:test";
import assert from "node:assert/strict";
import { newDoc } from "../src/model/doc.ts";
import type { Stamp } from "../src/model/types.ts";
import { S } from "../src/state/store.ts";
import { placeStamp, moveStampPoint, removeStampPoint, carryOffGrid } from "../src/state/layers.ts";

function stamp(id: string): Stamp {
  return { id, name: id, color: "#ffffff", notes: "", emoji: "⭐", points: [], typeId: null };
}

/** A fresh document holding stamps a and b. */
function setup(): { a: Stamp; b: Stamp } {
  S.doc = newDoc();
  const a = stamp("a"), b = stamp("b");
  S.doc.stamps.push(a, b);
  return { a, b };
}

test("placing a point gives it a new id, unique per placement", () => {
  const { a } = setup();
  placeStamp(a, 1, 1);
  placeStamp(a, 2, 1);
  assert.equal(a.points.length, 2);
  assert.match(a.points[0].id, /^pt_[a-z0-9]+$/);
  assert.notEqual(a.points[0].id, a.points[1].id);
});

test("placing a point where the same stamp already has one changes nothing", () => {
  const { a } = setup();
  placeStamp(a, 1, 1);
  const before = a.points[0];
  assert.equal(placeStamp(a, 1, 1), false);
  assert.deepEqual(a.points, [before]);
});

test("placing a point on another stamp's point deletes that point; the new point gets a new id", () => {
  const { a, b } = setup();
  placeStamp(a, 1, 1);
  placeStamp(a, 5, 5);
  const taken = a.points[0].id;
  placeStamp(b, 1, 1);
  assert.deepEqual(a.points.map((p) => [p.x, p.y]), [[5, 5]], "a lost the point at (1, 1)");
  assert.equal(b.points.length, 1);
  assert.notEqual(b.points[0].id, taken);
  assert.ok(!S.doc.stamps.some((s) => s.points.some((p) => p.id === taken)), "the taken point's id is gone");
});

test("dragging a point keeps its id and moves only that point", () => {
  const { a } = setup();
  placeStamp(a, 1, 1);
  placeStamp(a, 3, 1);
  const [p, q] = a.points;
  const moved = moveStampPoint(a, p, 2.5, 4);
  assert.deepEqual(moved, { id: p.id, x: 2.5, y: 4 });
  assert.deepEqual(a.points, [moved, q]);
});

test("a point can't be dragged exactly onto another point, its own stamp's or another stamp's", () => {
  const { a, b } = setup();
  placeStamp(a, 1, 1);
  placeStamp(a, 3, 1);
  placeStamp(b, 6, 1);
  const before = JSON.stringify(S.doc.stamps);
  assert.equal(moveStampPoint(a, a.points[0], 3, 1), null);
  assert.equal(moveStampPoint(a, a.points[0], 6, 1), null);
  assert.equal(JSON.stringify(S.doc.stamps), before);
});

test("removing a point removes its id; points placed later never reuse it", () => {
  const { a } = setup();
  placeStamp(a, 1, 1);
  const gone = a.points[0].id;
  removeStampPoint(a, a.points[0]);
  placeStamp(a, 1, 1);
  assert.equal(a.points.length, 1);
  assert.notEqual(a.points[0].id, gone);
});

test("moving a room carries its stamp points with their ids", () => {
  const { a } = setup();
  const room = { id: "r1", name: "R", areaId: S.doc.areas[0].id, color: null, notes: "", cells: ["0,0", "1,0"] };
  S.doc.rooms.push(room);
  placeStamp(a, 0, 0); // centred in the room
  placeStamp(a, 9, 9); // outside it
  const [inside, outside] = a.points;
  const putDown = carryOffGrid(room, new Set(room.cells), () => false);
  putDown(3, 2);
  const byId = new Map(a.points.map((p) => [p.id, p]));
  assert.deepEqual(byId.get(inside.id), { id: inside.id, x: 3, y: 2 });
  assert.deepEqual(byId.get(outside.id), outside);
});
