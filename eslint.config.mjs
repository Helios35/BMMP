import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * src/domain holds business rules as pure TypeScript. It imports nothing from
 * app, components, features, data or lib — if a rule needs data, the data is
 * passed in as an argument. Section 3.3.
 *
 * The point is testability and reviewability: a rule with no dependencies is
 * the cheapest and highest-value thing in the codebase to unit-test, and a rule
 * that cannot reach the database cannot quietly become a query.
 */
const DOMAIN_FORBIDDEN_IMPORTS = [
  {
    group: [
      "@/app",
      "@/app/**",
      "@/components",
      "@/components/**",
      "@/features",
      "@/features/**",
      "@/data",
      "@/data/**",
      "@/lib",
      "@/lib/**",
      "../*",
      "../**",
    ],
    message:
      "src/domain imports nothing from app, components, features, data or lib. If a rule needs data, pass the data in as an argument. Section 3.3.",
  },
  {
    group: ["react", "react-dom", "react/**", "next", "next/**", "server-only"],
    message:
      "src/domain is pure TypeScript. No React and no framework code. Section 3.1.",
  },
  {
    group: ["@supabase/**"],
    message:
      "src/domain never reaches the database. Data access lives in src/data only. Section 3.2, D-16.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    files: ["src/domain/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: DOMAIN_FORBIDDEN_IMPORTS },
      ],
      // No env reads. A rule whose behaviour depends on the environment cannot
      // be unit-tested against a fixed input, which is the whole point of the
      // folder. Section 3.1.
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "src/domain reads no environment. Pass configuration in as an argument. Section 3.1.",
        },
      ],
    },
  },

  // 'any' is not permitted in committed code. Use unknown and narrow it.
  // Section 4.
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Canonical documents and generated output are not linted.
    "docs/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
