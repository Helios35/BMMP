import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { jurisdictionRules, ruleVersions } from "@/data/mock/fixtures";

/**
 * Rules 1.23 and 5.21, enforced against the templates — **no regulatory
 * phrase, emergency text, certification text, artwork or citation is a
 * literal in a document template** (`b1a-06-documents`' hard rules). The
 * templates print payload fields; the words are rule versions' payloads.
 *
 * The sweep is data-driven: every string any rule version carries — the
 * container label phrase, the shipper certification, every citation — is
 * looked for in every template file. A template that reproduced one would
 * keep printing it after the rule version changed, which is the failure this
 * rule exists to prevent. A citation's shape is looked for too, so a citation
 * no fixture carries yet cannot slip in either.
 */

const TEMPLATES = join(
  process.cwd(),
  "src",
  "features",
  "documents",
  "templates",
);

function templateSources(): readonly { name: string; source: string }[] {
  return readdirSync(TEMPLATES)
    .filter((entry) => /\.tsx?$/.test(entry))
    .map((name) => ({
      name,
      source: readFileSync(join(TEMPLATES, name), "utf8"),
    }));
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(stringsIn);
  }
  return [];
}

/** Comments name the rules a line implements; only code and its strings are swept. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Long enough to be wording rather than a stored value such as `"days"`. */
const WORDING_LENGTH = 12;

describe("document templates", () => {
  const sources = templateSources();

  it("are found", () => {
    expect(sources.map((file) => file.name)).toEqual(
      expect.arrayContaining([
        "shipping-paper-template.tsx",
        "container-label-template.tsx",
        "document-frame.tsx",
      ]),
    );
  });

  it("carry no rule version's wording or citation", () => {
    const wording = [
      ...ruleVersions.flatMap((version) => [
        version.citation,
        ...stringsIn(version.payload),
      ]),
      ...jurisdictionRules.map((rule) => rule.title),
    ].filter((text) => text.length >= WORDING_LENGTH);
    expect(wording.length).toBeGreaterThan(0);

    const found = sources.flatMap(({ name, source }) =>
      wording
        .filter((text) => source.includes(text))
        .map((text) => `${name}: ${text}`),
    );
    expect(found).toEqual([]);
  });

  it("cite nothing", () => {
    const cited = sources.filter(({ source }) =>
      /\b(?:CFR|WAC|RCW|USC)\b/.test(stripComments(source)),
    );
    expect(cited.map((file) => file.name)).toEqual([]);
  });

  it("state no probability of anything (Rule 1.25)", () => {
    const stated = sources.filter(({ source }) =>
      /probability|likelihood|risk of fire|chance of/i.test(
        stripComments(source),
      ),
    );
    expect(stated.map((file) => file.name)).toEqual([]);
  });
});
