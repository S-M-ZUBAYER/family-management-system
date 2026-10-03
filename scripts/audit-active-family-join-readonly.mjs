import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { activeFamilyMembershipQuery } from "../lib/family-selection.ts";

const config = Object.fromEntries(readFileSync(resolve(".env.local"), "utf8")
  .split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const endpoint = new URL(config.SUPABASE_URL ?? "");
if (endpoint.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname) || !config.SUPABASE_SECRET_KEY) {
  throw new Error("A valid Supabase project configuration is required.");
}

const auditId = "00000000-0000-4000-8000-000000000000";
for (const [name, query] of [
  ["selected", activeFamilyMembershipQuery(auditId, auditId)],
  ["fallback", activeFamilyMembershipQuery(auditId)],
]) {
  const url = new URL(`/rest/v1/family_memberships?${query}`, endpoint);
  const response = await fetch(url, {
    headers: { apikey: config.SUPABASE_SECRET_KEY, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  console.log(`${name} active-family join: HTTP ${response.status}`);
  if (!response.ok) process.exitCode = 1;
}
