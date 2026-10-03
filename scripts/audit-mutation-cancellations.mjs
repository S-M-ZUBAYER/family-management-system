import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function clientFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? clientFiles(full) : entry.name.endsWith(".tsx") ? [full] : [];
  });
}

const misses = [];
let reviewed = 0;

for (const file of clientFiles("app")) {
  const source = readFileSync(file, "utf8");
  if (!source.startsWith('"use client"')) continue;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.initializer && ts.isAwaitExpression(node.initializer)
      && ts.isCallExpression(node.initializer.expression)
      && node.initializer.expression.expression.getText(parsed) === "fetch") {
      const fetchCall = node.initializer.expression;
      const options = fetchCall.arguments[1]?.getText(parsed) ?? "";
      if (/\bmethod\s*:/.test(options) && !options.includes('action: "mark_read"')) {
        reviewed += 1;
        const statement = node.parent.parent;
        const next = statement.parent;
        const remainder = source.slice(statement.end, next.end);
        const variable = node.name.text;
        const guard = new RegExp(`\\b${variable}\\.status\\s*===\\s*499\\b`);
        const parseOrCheck = new RegExp(`\\b${variable}\\.(?:json|ok)\\b`);
        const guardAt = remainder.search(guard);
        const parseAt = remainder.search(parseOrCheck);
        if (guardAt < 0 || (parseAt >= 0 && guardAt > parseAt)) {
          const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
          misses.push(`${file}:${line}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}

if (misses.length) {
  console.error(`Mutation cancellation guard missing in ${misses.length}/${reviewed} fetch handlers:\n${misses.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Mutation cancellation audit passed: ${reviewed} client fetch handlers stop on declined confirmation.`);
}
