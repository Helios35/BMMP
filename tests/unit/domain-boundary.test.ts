import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * GATE — src/domain imports nothing from app, components, features, data or lib.
 *
 * Linted as if the source were a file inside src/domain, so the boundary rule is
 * exercised on every push without committing a deliberately broken file. Also
 * broken by hand once and watched to fail; see BMMP Planning/briefs/BUILD_NOTES_b1a-setup.md.
 * Section 3.3.
 */
const repoRoot = join(import.meta.dirname, "..", "..");
const eslint = new ESLint({ cwd: repoRoot });

async function lintAsDomainFile(source: string) {
  const [result] = await eslint.lintText(source, {
    filePath: join(repoRoot, "src", "domain", "__boundary-proof.ts"),
  });
  return (result?.messages ?? []).map((message) => message.ruleId);
}

describe("the src/domain boundary", () => {
  it.each([
    ["@/data", 'import { data } from "@/data";'],
    ["@/lib", 'import { cn } from "@/lib/utils";'],
    ["@/app", 'import Page from "@/app/page";'],
    ["@/components", 'import { Button } from "@/components/ui/button";'],
    ["@/features", 'import { Intake } from "@/features/intake/intake";'],
    ["a relative escape", 'import { data } from "../data";'],
    ["a deeper relative escape", 'import { cn } from "../../lib/utils";'],
    ["react", 'import { useState } from "react";'],
    ["next", 'import { cookies } from "next/headers";'],
    ["supabase", 'import { createClient } from "@supabase/supabase-js";'],
  ])("refuses an import from %s", async (_label, statement) => {
    const ruleIds = await lintAsDomainFile(
      statement + "\nexport const proof = 1;\n",
    );
    expect(ruleIds).toContain("no-restricted-imports");
  });

  it("refuses an environment read", async () => {
    const ruleIds = await lintAsDomainFile(
      "export const days = Number(process.env.MAX_STORAGE_DAYS);\n",
    );
    expect(ruleIds).toContain("no-restricted-properties");
  });

  it("allows a pure rule that takes its data as an argument", async () => {
    const ruleIds = await lintAsDomainFile(
      [
        "const MAX_STORAGE_DAYS = 365;",
        "",
        "export function daysRemainingOnStorageClock(elapsedDays: number): number {",
        "  return MAX_STORAGE_DAYS - elapsedDays;",
        "}",
        "",
      ].join("\n"),
    );
    expect(ruleIds).toEqual([]);
  });

  it("allows an import from within src/domain itself", async () => {
    const ruleIds = await lintAsDomainFile(
      'import { thresholds } from "./thresholds";\nexport const proof = thresholds;\n',
    );
    expect(ruleIds).not.toContain("no-restricted-imports");
  });
});
