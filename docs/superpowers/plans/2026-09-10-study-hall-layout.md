# Study Hall Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the seat arranger into a focused grid-only classroom tool with an optional centered aisle, a restrained Chinese study-hall visual system, and a front-loaded non-commercial-use README.

**Architecture:** Keep the application dependency-free and browser-only. Simplify `layout` to rows, columns, and `aisle`; normalize legacy saved layouts at load time; render the aisle as a structural gap between otherwise unchanged seat indexes. Replace the existing CSS token layer and layout-specific rules while preserving existing import, drag-and-drop, storage, export, and print features.

**Tech Stack:** HTML, CSS, vanilla JavaScript, browser `localStorage`, Node.js built-in test runner, Playwright browser verification.

## Global Constraints

- The README first visible section must state: free use only, no commercial use, and reposting must cite the original repository.
- Only grid seating is available; old group and roundtable local data must open as a grid.
- One clear aisle toggle inserts a vertical gap at the center without changing seat count or seated-student order.
- Use the "雅正书院" palette: `#F5F0E6`, `#E6DDCD`, `#282621`, `#A83A2E`, `#355457`, and `#6A8063`.
- Do not use gradients, glow effects, water-ink backgrounds, scroll ornaments, or decorative imagery.
- Interactive controls retain visible focus feedback and at least 48px touch targets.

---

### Task 1: Add isolated layout helpers and behavior tests

**Files:**
- Create: `js/layout.js`
- Create: `tests/layout.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Produces: `window.SeatLayout.normalizeLayout(layout)` returning `{ rows, cols, aisle }`.
- Produces: `window.SeatLayout.getAisleAfterColumn(layout)` returning a zero-based column boundary or `null`.
- Consumes: `window.SeatLayout` from `js/layout.js` in `js/app.js`.

- [ ] **Step 1: Write failing tests for legacy normalization and central aisle location**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../js/layout.js", import.meta.url), "utf8"), sandbox);
const { getAisleAfterColumn, normalizeLayout } = sandbox.window.SeatLayout;

test("normalizes legacy group data to a grid with no aisle", () => {
  assert.deepEqual(
    normalizeLayout({ type: "group", rows: 3, cols: 8, groupSize: 6 }),
    { rows: 3, cols: 8, aisle: false }
  );
});

test("places an aisle after the left half for even and odd column counts", () => {
  assert.equal(getAisleAfterColumn({ rows: 6, cols: 6, aisle: true }), 2);
  assert.equal(getAisleAfterColumn({ rows: 6, cols: 5, aisle: true }), 1);
  assert.equal(getAisleAfterColumn({ rows: 6, cols: 1, aisle: true }), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail because the module is missing**

Run: `node --test tests/layout.test.mjs`

Expected: failure resolving `../js/layout.js`.

- [ ] **Step 3: Implement the minimal browser and Node compatible helper module**

```js
function normalizeLayout(layout = {}) {
  return {
    rows: Math.max(1, Number.parseInt(layout.rows, 10) || 6),
    cols: Math.max(1, Number.parseInt(layout.cols, 10) || 6),
    aisle: Boolean(layout.aisle),
  };
}

function getAisleAfterColumn({ cols, aisle }) {
  return aisle && cols > 1 ? Math.floor(cols / 2) - 1 : null;
}
```

Wrap the helpers in an IIFE and expose them as `window.SeatLayout`; Node tests load this same browser file in a `vm` sandbox.

- [ ] **Step 4: Load the helper before `js/app.js` and rerun tests**

Run: `node --test tests/layout.test.mjs`

Expected: two passing tests.

- [ ] **Step 5: Commit the testable layout foundation**

```powershell
git add index.html js/layout.js tests/layout.test.mjs
git commit -m "添加走道布局辅助函数"
```

### Task 2: Simplify the controls and grid rendering

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `js/layout.js`
- Test: `tests/layout.test.mjs`

**Interfaces:**
- Consumes: `SeatLayout.normalizeLayout()` and `SeatLayout.getAisleAfterColumn()`.
- Produces: grid-only persisted `layout` values shaped as `{ rows, cols, aisle }`.

- [ ] **Step 1: Extend the failing tests for clamping invalid grid dimensions**

```js
test("clamps invalid grid dimensions and preserves an enabled aisle", () => {
  assert.deepEqual(
    normalizeLayout({ rows: 0, cols: -3, aisle: true }),
    { rows: 1, cols: 1, aisle: true }
  );
});
```

- [ ] **Step 2: Run the specific test and verify it fails if the flag is not preserved**

Run: `node --test --test-name-pattern="clamps invalid" tests/layout.test.mjs`

Expected: failure before any helper modification is made.

- [ ] **Step 3: Remove non-grid controls and rendering branches**

Remove the layout select and group-size control from `index.html`; add a labeled checkbox with id `layout-aisle`. In `js/app.js`, normalize every loaded class layout, calculate seat count as `rows * cols`, keep students in their existing seating order when applying dimensions, and remove group/roundtable render functions and labels.

Use `getAisleAfterColumn` in `renderGrid` to add the `aisle-after` class to the last seat before the boundary in every row. The visual gap must not create a seat or alter `data-index` values.

- [ ] **Step 4: Update the helper only if required and rerun all layout tests**

Run: `node --test tests/layout.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit the grid-only interaction model**

```powershell
git add index.html js/app.js js/layout.js tests/layout.test.mjs
git commit -m "简化座位布局并添加中间走道"
```

### Task 3: Rebuild the visual system and document usage

**Files:**
- Create: `README.md`
- Modify: `css/style.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: existing semantic class names and the new `aisle-after` class from `js/app.js`.
- Produces: responsive "雅正书院" presentation without changing application actions.

- [ ] **Step 1: Add a README whose first section is the usage and reposting notice**

```markdown
# 使用与转载声明

- 本项目免费提供，仅供个人、学校及非商业场景使用。
- 禁止将本项目或其衍生成果用于销售、收费服务、广告引流或其他商业用途。
- 转载、分享或二次发布时，必须注明原始出处：<https://github.com/xzwkkcdf-qr/SeatArranger>。
```

Follow this with concise Chinese sections for overview, features, startup, and project structure.

- [ ] **Step 2: Replace the existing style tokens and layout-specific styling**

Define paper, ink, cinnabar, dark teal, and bamboo-green CSS tokens from Global Constraints. Remove every group/roundtable selector and all gradients. Use a compact desk-like top bar, a quieter roster side panel, an unframed primary seat chart, square-to-subtle (4px or less) corners, and a centered title-slip podium. Add `.seat.aisle-after { margin-inline-end: clamp(20px, 4vw, 56px); }`.

- [ ] **Step 3: Add visible keyboard focus, touch sizing, reduced-motion handling, and narrow-screen behavior**

Use `:focus-visible`, `@media (prefers-reduced-motion: reduce)`, and responsive rules so content never overflows a 375px viewport. Ensure toolbar buttons and field controls use a minimum 48px hit area.

- [ ] **Step 4: Start the static server and execute visual checks**

Run: `start /b python -m http.server 4173` then capture the default page at 1440px and 375px. Verify the design has no horizontal scroll, the aisle is visible when enabled, and the primary controls stay usable.

- [ ] **Step 5: Commit the visual redesign and documentation**

```powershell
git add README.md css/style.css index.html
git commit -m "重设计书院风格界面并补充说明"
```

### Task 4: Run final validation and publish

**Files:**
- Verify: `README.md`
- Verify: `index.html`
- Verify: `js/app.js`
- Verify: `css/style.css`

- [ ] **Step 1: Run static behavioral tests**

Run: `node --test tests/layout.test.mjs`

Expected: all tests pass.

- [ ] **Step 2: Run source quality checks**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Inspect rendered desktop and mobile captures**

Verify the 1440px and 375px captures for readable hierarchy, no overlap or clipping, clear focus/drag feedback, and no visual traces of group or roundtable layouts.

- [ ] **Step 4: Verify repository state and publish**

Run: `git status --short --branch; git push`

Expected: `main` tracks `origin/main` with all intended commits published.
