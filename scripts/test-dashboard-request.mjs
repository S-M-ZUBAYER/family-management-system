import assert from "node:assert/strict";
import test from "node:test";

import { fetchDashboardWithRetry } from "../lib/dashboard-request.ts";

test("dashboard request retries one transient upstream failure", async () => {
  for (const transient of [502, 503, 504]) {
    const statuses = [transient, 200], waits = [];
    const response = await fetchDashboardWithRetry(async () => new Response(null, { status: statuses.shift() }), async (duration) => { waits.push(duration); });
    assert.equal(response.status, 200);
    assert.deepEqual(waits, [250]);
  }
});

test("dashboard request does not retry authorization or row-limit errors", async () => {
  for (const status of [400, 401, 403, 409, 413, 500]) {
    let requests = 0;
    const response = await fetchDashboardWithRetry(async () => { requests += 1; return new Response(null, { status }); }, async () => {});
    assert.equal(response.status, status);
    assert.equal(requests, 1);
  }
});

test("dashboard request retries a network failure once", async () => {
  let requests = 0;
  const response = await fetchDashboardWithRetry(async () => { requests += 1; if (requests === 1) throw new Error("network"); return new Response(null, { status: 200 }); }, async () => {});
  assert.equal(response.status, 200);
  assert.equal(requests, 2);
});
