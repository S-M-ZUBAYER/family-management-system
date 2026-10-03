import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envLines = readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/);
const config = Object.fromEntries(envLines.filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
  const equals = line.indexOf("=");
  return [line.slice(0, equals), line.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const endpoint = new URL(config.SUPABASE_URL ?? "");
if (endpoint.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname)) {
  throw new Error("SUPABASE_URL must be an HTTPS Supabase project URL.");
}
if (!config.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is missing.");

const schema = readFileSync(resolve("supabase/schema.sql"), "utf8");
const tableDefinitions = [...schema.matchAll(/create table if not exists public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)];
const tables = tableDefinitions.map((match) => match[1]);
const uniqueTables = [...new Set(tables)];
const expectedColumns = new Map(tableDefinitions.map((match) => [match[1], match[2].split(/\r?\n/).flatMap((line) => {
  const column = /^  ([a-z_][a-z0-9_]*)\s+/i.exec(line)?.[1];
  return column && !["constraint", "primary", "unique", "check", "foreign"].includes(column) ? [column] : [];
})]));
const criticalColumns = {
  family_memberships: "id,preferred_locale",
  family_contact_tickets: "id,family_id",
  family_notifications: "id,family_id",
  family_notification_states: "notification_id,family_id,user_id",
  family_notification_preferences: "id,family_id",
  family_privacy_settings: "family_id",
  family_privacy_consents: "id,family_id",
  family_data_requests: "id,family_id",
  welfare_documents: "id,family_id",
  qurbani_campaigns: "id,family_id,status",
};

async function checkTable(table) {
  const url = new URL(`/rest/v1/${table}`, endpoint);
  url.searchParams.set("select", criticalColumns[table] ?? "id");
  url.searchParams.set("limit", "0");
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { apikey: config.SUPABASE_SECRET_KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    return { table, status: response.status, result: response.ok ? "available" : response.status === 401 || response.status === 403 ? "authorization failed" : response.status === 404 ? "missing or not exposed" : "unverified" };
  } catch (error) {
    return { table, status: null, result: `request failed (${error?.name ?? "unknown"})` };
  }
}

const results = [];
for (let index = 0; index < uniqueTables.length; index += 4) {
  results.push(...await Promise.all(uniqueTables.slice(index, index + 4).map(checkTable)));
}
for (const row of results) console.log(`${row.table}: ${row.status ?? "network"} ${row.result}`);
console.log(`Summary: ${results.filter((row) => row.result === "available").length}/${results.length} tables passed read-only REST checks.`);
try {
  const response = await fetch(new URL("/rest/v1/", endpoint), {
    headers: { apikey: config.SUPABASE_SECRET_KEY, Accept: "application/openapi+json" },
    signal: AbortSignal.timeout(15000),
  });
  if (response.ok) {
    const specification = await response.json();
    const definitions = specification.definitions ?? specification.components?.schemas ?? {};
    if (Object.keys(definitions).length) {
      let checkedColumns = 0;
      let missingColumns = 0;
      for (const [table, columns] of expectedColumns) {
        const properties = definitions[table]?.properties;
        if (!properties) continue;
        checkedColumns += columns.length;
        const missing = columns.filter((column) => !(column in properties));
        missingColumns += missing.length;
        if (missing.length) console.log(`Schema columns ${table}: missing ${missing.join(",")}`);
      }
      console.log(`Schema column summary: ${checkedColumns - missingColumns}/${checkedColumns} expected columns available in OpenAPI.`);
      for (const [table, columns] of Object.entries(criticalColumns)) {
        const properties = definitions[table]?.properties;
        if (!properties) {
          console.log(`OpenAPI columns ${table}: unavailable`);
          continue;
        }
        const missing = columns.split(",").filter((column) => !(column in properties));
        console.log(`OpenAPI columns ${table}: ${missing.length ? `missing ${missing.join(",")}` : "available"}`);
      }
    } else console.log("OpenAPI column definitions: unavailable.");
    for (const name of ["settle_welfare_outflow"]) {
      console.log(`RPC ${name}: ${Object.keys(specification.paths ?? {}).some((path) => path === `/rpc/${name}`) ? "exposed" : "not exposed (not proof of absence)"}`);
    }
  } else console.log(`OpenAPI catalog: HTTP ${response.status}; SQL Editor verification still required.`);
} catch (error) {
  console.log(`OpenAPI catalog: unavailable (${error?.name ?? "unknown"}); SQL Editor verification still required.`);
}
console.log("REST cannot verify triggers, indexes, function bodies, RLS policies, or migration order. Check those in the Supabase SQL Editor.");
