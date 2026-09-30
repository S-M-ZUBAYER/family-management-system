import fs from "node:fs";
import path from "node:path";

const roots = ["app", "components"];
const sourceExtensions = new Set([".ts", ".tsx"]);
const allowedIdenticalLabels = new Set([
  "Capacity",
  "Featured",
  "Gallery",
  "Ledger balance",
  "Meeting point",
  "Registration deadline",
  "Tags",
  "Tree connections",
  "Update",
]);

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(filePath);
    return sourceExtensions.has(path.extname(entry.name)) ? [filePath] : [];
  });
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

const failures = [];
let literalPairs = 0;

for (const filePath of roots.flatMap(collectFiles)) {
  const source = fs.readFileSync(filePath, "utf8");
  const pattern = /\bpick\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\)/g;

  for (const match of source.matchAll(pattern)) {
    literalPairs += 1;
    const bangla = match[1].trim();
    const english = match[2].trim();
    const location = `${filePath}:${lineNumber(source, match.index ?? 0)}`;

    if (!bangla || !english) {
      failures.push(`${location} has an empty Bangla or English literal.`);
      continue;
    }

    if (bangla === english && !allowedIdenticalLabels.has(bangla)) {
      failures.push(`${location} repeats the same untranslated label: "${bangla}".`);
    }
  }
}

if (failures.length) {
  console.error("Translation audit failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Translation audit passed: ${literalPairs} literal BN/EN pairs checked; identical product terms are restricted to the reviewed allowlist.`);
