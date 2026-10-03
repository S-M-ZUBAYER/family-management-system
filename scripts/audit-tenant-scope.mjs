import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apiRoot = path.join(root, "app", "api");
const publicRoots = [path.join(root, "app"), path.join(root, "components"), path.join(root, "public")];
const failures = [];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const location = path.join(directory, entry.name);
    return entry.isDirectory() ? files(location) : [location];
  }));
  return nested.flat();
}

for (const filename of (await files(apiRoot)).filter((file) => file.endsWith("route.ts"))) {
  const source = await readFile(filename, "utf8");
  const mutation = /supabaseRest\(\s*`([^`]+)`\s*,\s*\{\s*method:\s*"(PATCH|DELETE)"/gs;
  for (const match of source.matchAll(mutation)) {
    const target = match[1];
    if (target.includes("id=eq.") && !target.includes("family_id=eq.")) {
      failures.push(`${path.relative(root, filename)}: ${match[2]} by id is missing family_id scope`);
    }
  }

  const verifiesRequestedActiveMembership = filename.endsWith(path.join("workspace", "select", "route.ts"))
    && source.includes("family_memberships?")
    && source.includes("auth_user_id:")
    && source.includes("family_id:")
    && source.includes('status: "eq.active"');
  if (/export async function (POST|PUT|PATCH|DELETE)/.test(source)
    && !source.includes("getActiveFamilyMembership")
    && !verifiesRequestedActiveMembership
    && !filename.endsWith(path.join("setup", "family", "route.ts"))) {
    failures.push(`${path.relative(root, filename)}: mutation handler is missing active family membership verification`);
  }
}

for (const directory of publicRoots) {
  for (const filename of (await files(directory)).filter((file) => /\.(ts|tsx|js|jsx|svg|html)$/.test(file))) {
    const source = await readFile(filename, "utf8");
    if (/SUPABASE_SECRET_KEY|sb_secret_[a-z0-9]/i.test(source)) {
      failures.push(`${path.relative(root, filename)}: server secret reference found in client/public source`);
    }
  }
}

if (failures.length) {
  console.error("Tenant security audit failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Tenant security audit passed: mutations are membership-gated, direct id changes are family-scoped, and no Supabase secret is exposed in client/public source.");
