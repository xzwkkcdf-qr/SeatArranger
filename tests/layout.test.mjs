import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadLayoutHelpers() {
  const sandbox = { window: {} };
  const source = fs.readFileSync(new URL("../js/layout.js", import.meta.url), "utf8");
  vm.runInNewContext(source, sandbox);
  return sandbox.window.SeatLayout;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("normalizes legacy group data to a grid with no aisle", () => {
  const { normalizeLayout } = loadLayoutHelpers();

  assert.deepEqual(
    plain(normalizeLayout({ type: "group", rows: 3, cols: 8, groupSize: 6 })),
    { rows: 3, cols: 8, aisle: false }
  );
});

test("places an aisle after the left half for even and odd column counts", () => {
  const { getAisleAfterColumn } = loadLayoutHelpers();

  assert.equal(getAisleAfterColumn({ rows: 6, cols: 6, aisle: true }), 2);
  assert.equal(getAisleAfterColumn({ rows: 6, cols: 5, aisle: true }), 1);
  assert.equal(getAisleAfterColumn({ rows: 6, cols: 1, aisle: true }), null);
});

test("clamps invalid grid dimensions and preserves an enabled aisle", () => {
  const { normalizeLayout } = loadLayoutHelpers();

  assert.deepEqual(
    plain(normalizeLayout({ rows: 0, cols: -3, aisle: true })),
    { rows: 1, cols: 1, aisle: true }
  );
});

test("migrates the temporary multi-aisle shape to one central aisle", () => {
  const { getAisleAfterColumn, normalizeLayout } = loadLayoutHelpers();

  assert.deepEqual(
    plain(normalizeLayout({ rows: 6, cols: 6, aisles: [3, 6] })),
    { rows: 6, cols: 6, aisle: true }
  );
  assert.equal(getAisleAfterColumn({ rows: 6, cols: 6, aisles: [3, 6] }), 2);
});
