import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

const ALLOWED_EXPORTS = new Set([
  "default",
  "generateMetadata",
  "generateStaticParams",
  "revalidate",
  "dynamic",
  "dynamicParams",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
  "metadata",
]);

function collectPageFiles(dir: string, results: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      collectPageFiles(path.join(dir, entry.name), results);
    } else if (entry.isFile()) {
      if (/page\.(t|j)sx?$/.test(entry.name)) {
        results.push(path.join(dir, entry.name));
      }
    }
  }
  return results;
}

describe("app router pages", () => {
  it("only export allowed fields", () => {
    const root = path.join(process.cwd(), "app");
    const files = collectPageFiles(root);

    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const matches = Array.from(
        source.matchAll(/export\s+(?:const|function|class|let|var)\s+([A-Za-z0-9_]+)/g),
      );

      for (const match of matches) {
        const name = match[1];
        if (!ALLOWED_EXPORTS.has(name)) {
          throw new Error(`Invalid export "${name}" in ${path.relative(process.cwd(), file)}`);
        }
      }
    }
  });
});
