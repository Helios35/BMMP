import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findDataSeamViolations } from "../../scripts/check-data-seam.mjs";

/**
 * GATE — the data-seam check catches a Supabase import where it does not belong.
 *
 * A gate nobody has watched fail is not a gate, and a gate proven once by hand
 * decays silently over 32 weeks. This runs the checker against a fixture tree on
 * every push, so its failure behaviour is proven continuously rather than once.
 * D-16.
 */
let root: string;

async function write(relativePath: string, source: string) {
  const full = join(root, relativePath);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, source, "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "bmmp-seam-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("findDataSeamViolations", () => {
  it("passes a tree with no Supabase import at all", async () => {
    await write("src/app/page.tsx", "export default function Page() { return null; }\n");
    expect(await findDataSeamViolations({ root })).toEqual([]);
  });

  it("permits the import inside src/data/supabase and src/lib", async () => {
    await write(
      "src/data/supabase/index.ts",
      'import { createClient } from "@supabase/supabase-js";\nexport { createClient };\n',
    );
    await write(
      "src/lib/supabase-client.ts",
      'import { createBrowserClient } from "@supabase/ssr";\nexport { createBrowserClient };\n',
    );
    expect(await findDataSeamViolations({ root })).toEqual([]);
  });

  it("catches the import in a route handler", async () => {
    await write(
      "src/app/api/batteries/route.ts",
      '\nimport { createClient } from "@supabase/supabase-js";\n',
    );
    const violations = await findDataSeamViolations({ root });
    expect(violations).toEqual([
      {
        file: "src/app/api/batteries/route.ts",
        line: 2,
        specifier: "@supabase/supabase-js",
      },
    ]);
  });

  it.each([
    ['import { createClient } from "@supabase/supabase-js";', "static import"],
    ['import "@supabase/supabase-js";', "side-effect import"],
    ['export * from "@supabase/supabase-js";', "re-export"],
    ['const c = await import("@supabase/supabase-js");', "dynamic import"],
    ['const c = require("@supabase/supabase-js");', "require"],
  ])("catches a %s", async (source) => {
    await write("src/features/intake/leak.ts", source + "\n");
    const violations = await findDataSeamViolations({ root });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("src/features/intake/leak.ts");
  });

  it("catches the import in a test as well as in application code", async () => {
    await write("tests/unit/leak.test.ts", 'import "@supabase/supabase-js";\n');
    expect(await findDataSeamViolations({ root })).toHaveLength(1);
  });

  it("does not fire on a mention of the package in prose", async () => {
    await write(
      "src/domain/notes.ts",
      "// Data access lives in src/data, never @supabase/supabase-js.\nexport const x = 1;\n",
    );
    expect(await findDataSeamViolations({ root })).toEqual([]);
  });
});
