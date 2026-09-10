(function (global) {
  "use strict";

  function positiveInteger(value, fallback) {
    return Math.max(1, Number.parseInt(value, 10) || fallback);
  }

  function normalizeLayout(layout) {
    const source = layout || {};
    return {
      rows: positiveInteger(source.rows, 6),
      cols: positiveInteger(source.cols, 6),
      aisle: Boolean(source.aisle),
    };
  }

  function getAisleAfterColumn(layout) {
    const normalized = normalizeLayout(layout);
    return normalized.aisle && normalized.cols > 1
      ? Math.floor(normalized.cols / 2) - 1
      : null;
  }

  global.SeatLayout = { normalizeLayout, getAisleAfterColumn };
})(window);
