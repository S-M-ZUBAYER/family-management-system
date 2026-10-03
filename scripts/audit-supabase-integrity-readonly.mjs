import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// This is a best-effort REST snapshot. The SQL Editor audit is authoritative for
// indexes, triggers, grants, and an internally consistent database snapshot.
const env = Object.fromEntries(readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => {
    const equals = line.indexOf("=");
    return [line.slice(0, equals), line.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const endpoint = new URL(env.SUPABASE_URL ?? "");
if (endpoint.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname)) {
  throw new Error("SUPABASE_URL must be an HTTPS Supabase project URL.");
}
if (!env.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is missing.");

const pageSize = 500;
const maxRows = 20000;
async function readRows(table, columns, filter) {
  const rows = [];
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const url = new URL(`/rest/v1/${table}`, endpoint);
    url.searchParams.set("select", columns);
    url.searchParams.set("order", "id.asc");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    if (filter) url.searchParams.set(filter[0], filter[1]);
    const response = await fetch(url, {
      headers: { apikey: env.SUPABASE_SECRET_KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`${table}: unexpected response`);
    rows.push(...page);
    if (rows.length > maxRows) throw new Error(`${table}: above ${maxRows} rows; use the SQL Editor audit`);
    if (page.length < pageSize) return rows;
  }
  throw new Error(`${table}: above ${maxRows} rows; use the SQL Editor audit`);
}

function key(row) {
  return `${row.family_id}:${row.id}`;
}

try {
  const expenses = await readRows("welfare_expenses", "id,family_id,linked_request_id", ["linked_request_id", "not.is.null"]);
  const expenseLinks = new Map();
  for (const expense of expenses) {
    const link = `${expense.family_id}:${expense.linked_request_id}`;
    expenseLinks.set(link, (expenseLinks.get(link) ?? 0) + 1);
  }
  const duplicateGroups = [...expenseLinks.values()].filter((count) => count > 1).length;
  console.log(`Duplicate Welfare expense/request groups: ${duplicateGroups} (${expenses.length} linked expenses checked)`);

  for (const [documentTable, parentTables] of [
    ["welfare_documents", { fund: "welfare_funds", contribution: "welfare_contributions", expense: "welfare_expenses", request: "welfare_requests" }],
    ["household_documents", { shopping_list: "household_shopping_lists", bill: "household_utility_bills", maintenance: "household_maintenance_requests" }],
  ]) {
    const documents = await readRows(documentTable, "id,family_id,entity_type,entity_id");
    const parents = new Map();
    for (const [type, table] of Object.entries(parentTables)) {
      parents.set(type, new Set((await readRows(table, "id,family_id")).map(key)));
    }
    const orphans = documents.filter((document) => !parents.get(document.entity_type)?.has(`${document.family_id}:${document.entity_id}`)).length;
    console.log(`Orphan ${documentTable} records: ${orphans} (${documents.length} documents checked)`);
  }
  console.log("REST audit complete. Results are best-effort during concurrent writes; run the SQL Editor audit for authoritative verification.");
} catch (error) {
  console.error(`Integrity audit incomplete: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
