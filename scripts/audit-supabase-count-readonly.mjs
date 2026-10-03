import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const config = Object.fromEntries(readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
  const equals = line.indexOf("=");
  return [line.slice(0, equals), line.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const endpoint = new URL(config.SUPABASE_URL ?? "");
if (endpoint.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname) || !config.SUPABASE_SECRET_KEY) {
  throw new Error("A valid Supabase URL and secret key are required in .env.local.");
}

const url = new URL("/rest/v1/chat_messages", endpoint);
url.searchParams.set("select", "id");
url.searchParams.set("limit", "0");
const response = await fetch(url, {
  method: "HEAD",
  headers: { apikey: config.SUPABASE_SECRET_KEY, Prefer: "count=exact" },
  signal: AbortSignal.timeout(15000),
});
const range = response.headers.get("Content-Range") ?? "";
const valid = response.ok && /^\*\/\d+$|^\d+-\d+\/\d+$/.test(range);
console.log(`Read-only exact-count probe: ${response.status}; numeric count header: ${valid ? "yes" : "no"}.`);
const scopedUrl = new URL("/rest/v1/chat_messages", endpoint);
scopedUrl.searchParams.set("select", "id");
scopedUrl.searchParams.set("limit", "0");
scopedUrl.searchParams.set("family_id", "eq.00000000-0000-4000-8000-000000000000");
scopedUrl.searchParams.set("channel_id", "eq.00000000-0000-4000-8000-000000000000");
scopedUrl.searchParams.set("auth_user_id", "neq.read-only-probe");
scopedUrl.searchParams.set("created_at", "gt.2026-01-01T00:00:00Z");
const scopedResponse = await fetch(scopedUrl, {
  method: "HEAD",
  headers: { apikey: config.SUPABASE_SECRET_KEY, Prefer: "count=exact" },
  signal: AbortSignal.timeout(15000),
});
const scopedRange = scopedResponse.headers.get("Content-Range") ?? "";
const scopedValid = scopedResponse.ok && scopedRange.endsWith("/0");
console.log(`Read-only scoped count probe: ${scopedResponse.status}; empty-result count header: ${scopedValid ? "yes" : "no"}.`);
if (!valid || !scopedValid) process.exitCode = 1;
