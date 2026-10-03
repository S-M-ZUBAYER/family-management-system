import assert from "node:assert/strict";
import test from "node:test";

import { qurbaniDistributionTotals } from "../lib/qurbani-distribution-totals.ts";

test("uncollected allocations do not count as delivered meat", () => {
  assert.deepEqual(qurbaniDistributionTotals([
    { weight_kg: "5.50", package_count: 2, collected_at: null },
  ]), {
    allocatedKg: 5.5, collectedKg: 0, pendingKg: 5.5,
    allocatedPackages: 2, collectedPackages: 0, pendingPackages: 2,
  });
});

test("collected distributions count separately with precise hundredth sums", () => {
  assert.deepEqual(qurbaniDistributionTotals([
    { weight_kg: "0.10", package_count: 1, collected_at: "2027-05-20T09:00:00.000Z" },
    { weight_kg: "0.20", package_count: 1, collected_at: "2027-05-20T09:05:00.000Z" },
    { weight_kg: "1.25", package_count: 3, collected_at: null },
  ]), {
    allocatedKg: 1.55, collectedKg: 0.3, pendingKg: 1.25,
    allocatedPackages: 5, collectedPackages: 2, pendingPackages: 3,
  });
});
