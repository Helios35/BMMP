#!/usr/bin/env node
/**
 * The data-seam check.
 *
 * Fails if any file outside the two permitted folders imports the Supabase
 * client. This is what keeps Section 3.2 true over 32 weeks instead of only on
 * day one — a seam that is only correct on day one is not a seam. D-16.
 *
 * Required status check in CI, not a nice-to-have.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The only two folders permitted to import the Supabase client. */
export const ALLOWED_PREFIXES = ["src/data/supabase/", "src/lib/"];

/** Folders swept. scripts/ is excluded: this file names the package it looks for. */
export const SCANNED_ROOTS = ["src", "tests"];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];

const IMPORT_PATTERNS = [
  /\b(?:from|import)\s*\(?\s*['"](@supabase\/[^'"]+)['"]/g,
  /\brequire\s*\(\s*['"](@supabase\/[^'"]+)['"]/g,
];

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      yield* walk(full);
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      yield full;
    }
  }
}

function isAllowed(posixPath) {
  return ALLOWED_PREFIXES.some((prefix) => posixPath.startsWith(prefix));
}

/**
 * @param {{ root?: string, roots?: string[] }} [options]
 * @returns {Promise<{ file: string, line: number, specifier: string }[]>}
 */
export async function findDataSeamViolations(options = {}) {
  const root = options.root ?? process.cwd();
  const roots = options.roots ?? SCANNED_ROOTS;
  const violations = [];

  for (const scanRoot of roots) {
    for await (const file of walk(join(root, scanRoot))) {
      const posixPath = relative(root, file).split(sep).join("/");
      if (isAllowed(posixPath)) continue;

      const source = await readFile(file, "utf8");
      for (const pattern of IMPORT_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(source)) !== null) {
          violations.push({
            file: posixPath,
            line: source.slice(0, match.index).split("\n").length,
            specifier: match[1],
          });
        }
      }
    }
  }

  return violations;
}

async function main() {
  const violations = await findDataSeamViolations();

  if (violations.length === 0) {
    console.log(
      `data-seam: ok — no @supabase/* import outside ${ALLOWED_PREFIXES.join(" or ")}`,
    );
    return;
  }

  console.error("data-seam: FAILED\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} imports ${v.specifier}`);
  }
  console.error(
    `\nOnly ${ALLOWED_PREFIXES.join(" and ")} may import the Supabase client.`,
  );
  console.error(
    "Everything else goes through src/data. PROJECT_SETUP_BMMP.md Section 3.2, D-16.",
  );
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
