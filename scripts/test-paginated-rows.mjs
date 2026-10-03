import assert from "node:assert/strict";
import test from "node:test";

import { collectPaginatedRows, PaginatedRowLimitError } from "../lib/paginated-rows.ts";

test("collects every page in order without a silent export cutoff", async () => {
  const source = [1, 2, 3, 4, 5];
  const calls = [];
  const rows = await collectPaginatedRows(async (offset, limit) => {
    calls.push([offset, limit]);
    return source.slice(offset, offset + limit);
  }, { pageSize: 2, maxRows: 6 });
  assert.deepEqual(rows, source);
  assert.deepEqual(calls, [[0, 2], [2, 2], [4, 2]]);
});

test("permits exactly the configured maximum after checking the next page", async () => {
  const source = [1, 2, 3, 4];
  const rows = await collectPaginatedRows(async (offset, limit) => source.slice(offset, offset + limit), { pageSize: 2, maxRows: 4 });
  assert.deepEqual(rows, source);
});

test("rejects records above the maximum instead of returning a partial result", async () => {
  const source = [1, 2, 3, 4, 5];
  await assert.rejects(
    collectPaginatedRows(async (offset, limit) => source.slice(offset, offset + limit), { pageSize: 2, maxRows: 4 }),
    (error) => error instanceof PaginatedRowLimitError && error.maxRows === 4,
  );
});

test("rejects an oversized page from the data source", async () => {
  await assert.rejects(
    collectPaginatedRows(async () => [1, 2, 3], { pageSize: 2, maxRows: 4 }),
    /more rows than requested/,
  );
});
