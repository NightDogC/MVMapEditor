import test from "node:test";
import assert from "node:assert/strict";
import { newCategoryId } from "../src/util.ts";

test("newCategoryId: prefix + six base-36 characters, never one of the used ids", () => {
  assert.match(newCategoryId(new Set(), "Type"), /^Type_[0-9a-z]{6}$/);
  const real = Math.random;
  const draws = [0.5, 0.25]; // 0.5 gives "i00000", 0.25 gives "900000"
  Math.random = () => draws.shift()!;
  try {
    assert.equal(newCategoryId(new Set(["Type_i00000"]), "Type"), "Type_900000", "a used id is drawn again");
  } finally {
    Math.random = real;
  }
});
