#!/usr/bin/env node
/**
 * The contact sheet — every screen this product renders, in both themes, at
 * three widths, captured against a server this script built itself.
 *
 * ## Why it exists
 *
 * Unit 01 shipped twelve routes and every gate was green. Eight defects were
 * found by things that *measure* — a contrast calculation, a bounding-box sweep,
 * a `scrollWidth` check — and none by reading a diff. A measurement proves a
 * floor is cleared. It says nothing about whether twelve pages look like one
 * product, and nothing at all about how any of them renders in dark mode.
 *
 * **Reading a diff does not tell anyone whether a layout pass worked. Looking at
 * it does.** This is the artifact a reviewer opens first.
 *
 * ## Why it starts its own server, always
 *
 * `playwright.config.ts` carried `reuseExistingServer: !process.env.CI` through
 * unit 01, so a stray process on the port was silently adopted instead of the
 * suite building its own — and it happened. **Every image produced from such a
 * run is a picture of whatever that process was serving.** This script builds,
 * starts and stops its own server on a port it has proved is free, and refuses
 * to run when it cannot.
 *
 * ## Usage
 *
 *     pnpm contact-sheet                  # capture the `after` set + rebuild the index
 *     pnpm contact-sheet --set before     # capture the `before` set
 *     pnpm contact-sheet --index-only     # rebuild the index from what is on disk
 *     pnpm contact-sheet --only battery   # capture the screens whose id contains "battery"
 *     pnpm contact-sheet --port 3210      # move out of the way of a dev server
 *
 * Output lands in `contact-sheet/<set>/<screen>__<theme>__<width>.png` with a
 * single `contact-sheet/index.html` putting before and after side by side.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

/* ------------------------------------------------------------------ people */

/**
 * The fixture identities, restated rather than imported.
 *
 * `tests/e2e/support/roles.ts` makes the same call for the same reason: an
 * import would pull `src/data/mock/index.ts` — and with it the whole in-memory
 * store — into this process, and this script must drive the product the way a
 * person does. The addresses come from the `users` array in
 * `src/data/mock/fixtures/index.ts` and the password from `MOCK_DEV_PASSWORD` in
 * `src/data/mock/identity.ts`.
 *
 * **The duplication cannot drift silently**: every value here is an input to a
 * real sign-in through the real form, so a changed fixture fails this script
 * loudly on its first screen.
 */
const PERSONAS = {
  p1: {
    email: "dana.okafor@cascade-recyclers.example",
    label: "P1 · Compliance Handler, Cascade",
  },
  p2: {
    email: "marta.bellini@cascade-recyclers.example",
    label: "P2 · Facility Manager, Cascade",
  },
  p5: {
    email: "s.reyes@northbeam-underwriting.example",
    label: "P5 · Auditor, Cascade",
  },
  p1Olympic: {
    email: "tom.ashby@olympic-mobility.example",
    label: "P1 · Compliance Handler, Olympic — no Terms of Service in force",
  },
};

const FIXTURE_PASSWORD = "bmmp-dev-password";

/**
 * A live invitation token — `INVITE_TOKENS.pendingHandler` in
 * `src/data/mock/fixtures/invite-tokens.ts`, which is readable precisely so a
 * person can type it into an address bar.
 */
const PENDING_INVITE_TOKEN = "inv-pending-handler-7c1f4a9d20b6e358";

/* ----------------------------------------------------------------- screens */

/**
 * Two records and one catalog entry are resolved from the running product
 * rather than restated as identifiers: the script opens the list, finds the row
 * by the number a warehouse reads, and takes the href off it. A UUID copied into
 * this file would be a second copy of a fixture; a record number is what the
 * screen already shows.
 */
const RESOLVE = {
  vehiclePack: {
    from: "/batteries",
    as: "p2",
    match: "BR-0001",
    label: "the vehicle traction pack",
  },
  swollenPack: {
    from: "/batteries",
    as: "p2",
    match: "BR-0003",
    label: "the swollen pack, air transport hard-blocked",
  },
  catalogEntry: {
    from: "/catalog",
    as: "p2",
    match: "NV-TP400",
    label: "the vehicle traction catalog entry",
  },
};

/**
 * Every screen the sheet carries.
 *
 * The twelve routes unit 01 built, plus the states that change what renders:
 * a populated list, a zero-records empty, a filtered empty, a search empty, a
 * route denial, a detail page on two tabs, the two E-8a auditor compositions,
 * the hard block, and both screens where E-12 removes an affordance.
 *
 * `group` orders the index. `path` is either a string or a function of the
 * resolved hrefs.
 */
const SCREENS = [
  // --- public ------------------------------------------------------------
  {
    id: "sign-in",
    group: "Public",
    route: "/sign-in",
    title: "Sign in",
    path: "/sign-in",
    as: null,
    note: "The product's front door. No app chrome.",
  },
  {
    id: "sign-up",
    group: "Public",
    route: "/sign-up",
    title: "Sign up",
    path: "/sign-up",
    as: null,
    note: "Founds an organization, and carries the Terms of Service grant in the visible label.",
  },
  {
    id: "invite-token",
    group: "Public",
    route: "/invite/[token]",
    title: "Accept invitation",
    path: `/invite/${PENDING_INVITE_TOKEN}`,
    as: null,
    note: "A live token. No tenant data before authentication.",
  },

  // --- dashboard ---------------------------------------------------------
  {
    id: "dashboard",
    group: "Dashboard",
    route: "/",
    title: "Dashboard — populated",
    path: "/",
    as: "p2",
    note: "Every region present: alerts, storage summary, review queue, recent activity, quick actions.",
  },
  {
    id: "dashboard-consent-blocked",
    group: "Dashboard",
    route: "/",
    title: "Dashboard — E-12, no acceptance in force",
    path: "/",
    as: "p1Olympic",
    note: "E-12 and E-1 together: intake blocked organization-wide, and no records at all.",
  },

  // --- batteries ---------------------------------------------------------
  {
    id: "batteries-list",
    group: "Batteries",
    route: "/batteries",
    title: "Batteries — populated list",
    path: "/batteries",
    as: "p2",
    note: "A 480 kg vehicle pack and a 24.5 kg mobility-scooter pack as adjacent rows, one set of cells.",
  },
  {
    id: "batteries-empty",
    group: "Batteries",
    route: "/batteries",
    title: "Batteries — E-1, zero records",
    path: "/batteries",
    as: "p1Olympic",
    note: "The zero-records onboarding state, with the intake action absent under E-12.",
  },
  {
    id: "batteries-filtered-empty",
    group: "Batteries",
    route: "/batteries",
    title: "Batteries — filters exclude everything",
    path: "/batteries?from=2099-01-01",
    as: "p2",
    note: "Distinct from zero records: different sentence, different action.",
  },
  {
    id: "batteries-search-empty",
    group: "Batteries",
    route: "/batteries",
    title: "Batteries — search matches nothing",
    path: "/batteries?q=zzzz-no-such-record",
    as: "p2",
    note: "The third empty. A search that misses is not a filter that excludes.",
  },
  {
    id: "batteries-new-open",
    group: "Batteries",
    route: "/batteries/new",
    title: "Log a battery — gate open",
    path: "/batteries/new",
    as: "p1",
    note: "The gate plus scaffolding. Unit 02 replaces the scaffolding and keeps the gate.",
  },
  {
    id: "batteries-new-blocked",
    group: "Batteries",
    route: "/batteries/new",
    title: "Log a battery — E-12, blocked",
    path: "/batteries/new",
    as: "p1Olympic",
    note: "Names who can accept, and offers no link P1 would be redirected away from.",
  },

  // --- battery record ----------------------------------------------------
  {
    id: "battery-record",
    group: "Battery record",
    route: "/batteries/[id]",
    title: "Battery record — Overview",
    path: (r) => r.vehiclePack,
    as: "p2",
    note: "The detail page with tabs. Every value carries where it came from.",
  },
  {
    id: "battery-record-history",
    group: "Battery record",
    route: "/batteries/[id]",
    title: "Battery record — History tab",
    path: (r) => `${r.vehiclePack}?tab=history`,
    as: "p2",
    note: "The second tab, so the tab row is seen in both states.",
  },
  {
    id: "battery-record-auditor",
    group: "Battery record",
    route: "/batteries/[id]",
    title: "Battery record — E-8a, auditor",
    path: (r) => r.vehiclePack,
    as: "p5",
    note: "Read-only banner, mutating controls disabled with a stated reason, destructive ones absent.",
  },
  {
    id: "battery-record-hard-block",
    group: "Battery record",
    route: "/batteries/[id]",
    title: "Battery record — damaged-or-defective block",
    path: (r) => r.swollenPack,
    as: "p2",
    note: "A persistent, non-dismissible block above every tab.",
  },

  // --- catalog -----------------------------------------------------------
  {
    id: "catalog-list",
    group: "Catalog",
    route: "/catalog",
    title: "Catalog — populated list",
    path: "/catalog",
    as: "p2",
    note: "Search is the primary action. No create affordance on this route.",
  },
  {
    id: "catalog-entry",
    group: "Catalog",
    route: "/catalog/[id]",
    title: "Catalog entry",
    path: (r) => r.catalogEntry,
    as: "p2",
    note: "One page, no tabs. Carries the unrecognised source-type treatment.",
  },
  {
    id: "catalog-entry-auditor",
    group: "Catalog",
    route: "/catalog/[id]",
    title: "Catalog entry — E-8a, auditor",
    path: (r) => r.catalogEntry,
    as: "p5",
    note: "The banner plus the one disabled mutating control.",
  },

  // --- settings ----------------------------------------------------------
  {
    id: "settings-organization",
    group: "Settings",
    route: "/settings/organization",
    title: "Organization",
    path: "/settings/organization",
    as: "p2",
    note: "The longest page in the product: five sections behind a section nav.",
  },
  {
    id: "settings-users",
    group: "Settings",
    route: "/settings/users",
    title: "Members and roles",
    path: "/settings/users",
    as: "p2",
    note: "A table inside a section, plus two summary sections.",
  },

  // --- audit -------------------------------------------------------------
  {
    id: "audit-log",
    group: "Audit log",
    route: "/audit",
    title: "Audit log — populated",
    path: "/audit",
    as: "p2",
    note: "Every row non-navigable, each stating why. The 44px reason trigger lives here.",
  },
  {
    id: "audit-log-auditor",
    group: "Audit log",
    route: "/audit",
    title: "Audit log — auditor",
    path: "/audit",
    as: "p5",
    note: "P5's primary destination. The banner is fixed on this route and export is never disabled.",
  },
  {
    id: "audit-filtered-empty",
    group: "Audit log",
    route: "/audit",
    title: "Audit log — no activity in range",
    path: "/audit?from=2099-01-01",
    as: "p2",
    note: "The route's own filtered-empty copy rather than the generic sentence.",
  },

  // --- denial ------------------------------------------------------------
  {
    id: "route-denial",
    group: "Denial",
    route: "/",
    title: "Route denial — P1 reaching for the audit log",
    path: "/audit",
    as: "p1",
    landsOn: "/",
    note: "Redirected to the dashboard with a toast naming the restriction. Rule 12.8.",
  },
];

const THEMES = ["light", "dark"];

/** §4.1's phone, tablet and desk. */
const VIEWPORTS = [
  { width: 375, height: 812, label: "375 · phone in a storage room" },
  { width: 768, height: 1024, label: "768 · tablet" },
  { width: 1440, height: 900, label: "1440 · desk" },
];

/* -------------------------------------------------------------------- args */

function parseArgs(argv) {
  const args = {
    set: "after",
    port: 3210,
    only: null,
    indexOnly: false,
    keepServer: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--set") args.set = argv[(i += 1)];
    else if (flag === "--port") args.port = Number(argv[(i += 1)]);
    else if (flag === "--only") args.only = argv[(i += 1)];
    else if (flag === "--index-only") args.indexOnly = true;
    else if (flag === "--keep-server") args.keepServer = true;
    else throw new Error(`Unknown flag: ${flag}`);
  }
  if (args.set !== "before" && args.set !== "after") {
    throw new Error(`--set takes "before" or "after", not "${args.set}"`);
  }
  return args;
}

/* ------------------------------------------------------------------ server */

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)),
    );
  });
}

async function waitForHealth(baseUrl, deadlineMs = 120_000) {
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        const body = await response.json();
        if (body.status === "ok") return body;
      }
    } catch {
      // not listening yet
    }
    if (Date.now() - started > deadlineMs) {
      throw new Error(`${baseUrl}/api/health never answered`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * Build, then start, on a port proved free.
 *
 * Every switch the server reads is stated here rather than inherited, for the
 * reason `playwright.config.ts` states: a `MOCK_LATENCY_MS` leaking out of a
 * developer's shell would change what is captured without changing a line of
 * this file.
 */
async function startOwnServer(port) {
  if (!(await isPortFree(port))) {
    throw new Error(
      `Port ${port} is already in use.\n` +
        `The contact sheet always builds and starts its own server — a picture ` +
        `of someone else's process is worse than no picture.\n` +
        `Stop whatever is on ${port}, or pass --port <n>.`,
    );
  }

  const env = {
    ...process.env,
    DATA_ADAPTER: process.env.DATA_ADAPTER ?? "mock",
    MOCK_LATENCY_MS: "",
    MOCK_SEEDED_FAILURES: "",
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
    PORT: String(port),
  };

  console.log("→ building");
  await run("pnpm", ["build"], { env });

  console.log(`→ starting on ${port}`);
  const server = spawn("pnpm", ["start"], {
    stdio: ["ignore", "inherit", "inherit"],
    shell: process.platform === "win32",
    env,
    detached: process.platform !== "win32",
  });

  const baseUrl = `http://localhost:${port}`;
  const health = await waitForHealth(baseUrl);
  console.log(`→ health ok — adapter ${health.activeAdapterName}`);

  return {
    baseUrl,
    async stop() {
      if (server.exitCode !== null) return;
      if (process.platform === "win32") {
        await run("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
          stdio: "ignore",
        }).catch(() => {});
      } else {
        try {
          process.kill(-server.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    },
  };
}

/* ---------------------------------------------------------------- capture */

/** Sign in through the real form, the way a person does. */
async function signIn(page, baseUrl, persona) {
  await page.goto(`${baseUrl}/sign-in`);
  await page.getByLabel("Email").fill(persona.email);
  await page.getByLabel("Password").fill(FIXTURE_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/sign-in")),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

/**
 * The href of the row a warehouse would point at.
 *
 * Matched on the whole row rather than on the primary cell: `/batteries` makes
 * the record number the link target and `/catalog` makes the manufacturer one,
 * so the value a person recognises is not always the one carrying the anchor.
 */
async function resolveHref(page, baseUrl, spec) {
  await page.goto(`${baseUrl}${spec.from}`);
  const anchor = page
    .locator("tr", { hasText: spec.match })
    .locator('a[data-row-anchor="true"]')
    .first();
  const href = await anchor.getAttribute("href");
  if (href === null) {
    throw new Error(
      `Could not resolve ${spec.label}: no row for "${spec.match}" on ${spec.from}`,
    );
  }
  return href;
}

async function settle(page, screen) {
  const landed = screen.landsOn ?? null;
  if (landed !== null) {
    await page.waitForURL((url) => url.pathname === landed);
  }
  const marker = screen.as === null ? "text=BMMP" : "#page-title";
  await page.locator(marker).first().waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function capturePage(page, screen, url, file) {
  await page.goto(url);
  await settle(page, screen);
  await page.screenshot({
    path: file,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
}

async function withRetries(attempts, label, run) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await run();
      return;
    } catch (error) {
      if (attempt >= attempts) {
        throw new Error(`${label} failed after ${attempts} attempts`, {
          cause: error,
        });
      }
      console.log(
        `  retrying ${label} (${attempt}/${attempts - 1}): ${
          error instanceof Error ? error.message.split("\n")[0] : error
        }`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function capture(args, baseUrl) {
  const browser = await chromium.launch();
  const outDir = path.join("contact-sheet", args.set);
  await mkdir(outDir, { recursive: true });

  // Sign in once per persona; the cookie is the same in both themes.
  const states = {};
  for (const [key, persona] of Object.entries(PERSONAS)) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, baseUrl, persona);
    states[key] = await context.storageState();
    await context.close();
    console.log(`→ signed in as ${key}`);
  }

  // Resolve the detail hrefs from the product.
  const resolver = await browser.newContext({ storageState: states.p2 });
  const resolverPage = await resolver.newPage();
  const resolved = {};
  for (const [key, spec] of Object.entries(RESOLVE)) {
    resolved[key] = await resolveHref(resolverPage, baseUrl, spec);
    console.log(`→ resolved ${key} → ${resolved[key]}`);
  }
  await resolver.close();

  const screens = SCREENS.filter(
    (screen) => args.only === null || screen.id.includes(args.only),
  );

  let count = 0;
  for (const theme of THEMES) {
    for (const [personaKey, persona] of [
      [null, null],
      ...Object.entries(PERSONAS),
    ]) {
      const forThisPersona = screens.filter(
        (screen) => screen.as === personaKey,
      );
      if (forThisPersona.length === 0) continue;

      const context = await browser.newContext({
        colorScheme: theme,
        ...(personaKey === null ? {} : { storageState: states[personaKey] }),
      });
      const page = await context.newPage();

      for (const screen of forThisPersona) {
        const target =
          typeof screen.path === "function"
            ? screen.path(resolved)
            : screen.path;

        for (const viewport of VIEWPORTS) {
          await page.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          // A hundred-and-forty-four navigations against a local server take
          // long enough that a laptop can suspend its network stack part-way
          // through — which is what `ERR_NETWORK_IO_SUSPENDED` is. Three tries,
          // then fail loudly: **a missing image is better than a wrong one**,
          // and a half-captured set is exactly the artifact this script exists
          // to make trustworthy.
          await withRetries(3, `${screen.id} ${theme} ${viewport.width}`, () =>
            capturePage(
              page,
              screen,
              `${baseUrl}${target}`,
              path.join(
                outDir,
                `${screen.id}__${theme}__${viewport.width}.png`,
              ),
            ),
          );
          count += 1;
        }
        console.log(`  ${theme.padEnd(5)} ${screen.id}`);
      }

      await context.close();
      void persona;
    }
  }

  await browser.close();
  console.log(`→ ${count} images into ${outDir}`);
}

/* ------------------------------------------------------------------ index */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function listSet(set) {
  try {
    return new Set(await readdir(path.join("contact-sheet", set)));
  } catch {
    return new Set();
  }
}

async function writeIndex() {
  const before = await listSet("before");
  const after = await listSet("after");

  const groups = [];
  for (const screen of SCREENS) {
    let group = groups.find((candidate) => candidate.name === screen.group);
    if (group === undefined) {
      group = { name: screen.group, screens: [] };
      groups.push(group);
    }
    group.screens.push(screen);
  }

  const cell = (set, file, label) => {
    const present = (set === "before" ? before : after).has(file);
    if (!present) {
      return `<div class="cell missing"><span>${label} — not captured</span></div>`;
    }
    return `<figure class="cell"><figcaption>${label}</figcaption><a href="${set}/${file}" target="_blank" rel="noreferrer"><img loading="lazy" src="${set}/${file}" alt="${escapeHtml(label)}"></a></figure>`;
  };

  const sections = groups
    .map(
      (group) => `
<section class="group">
  <h2 id="group-${escapeHtml(group.name.toLowerCase().replaceAll(" ", "-"))}">${escapeHtml(group.name)}</h2>
  ${group.screens
    .map(
      (screen) => `
  <article class="screen" id="${screen.id}">
    <header>
      <h3>${escapeHtml(screen.title)}</h3>
      <p class="meta"><code>${escapeHtml(screen.route)}</code>${
        screen.as === null
          ? " · public"
          : ` · ${escapeHtml(PERSONAS[screen.as].label)}`
      }</p>
      <p class="note">${escapeHtml(screen.note)}</p>
    </header>
    ${THEMES.map(
      (theme) => `
    <div class="theme">
      <h4>${theme}</h4>
      ${VIEWPORTS.map(
        (viewport) => `
      <div class="pair">
        <p class="width">${escapeHtml(viewport.label)}</p>
        <div class="cells">
          ${cell("before", `${screen.id}__${theme}__${viewport.width}.png`, "before")}
          ${cell("after", `${screen.id}__${theme}__${viewport.width}.png`, "after")}
        </div>
      </div>`,
      ).join("")}
    </div>`,
    ).join("")}
  </article>`,
    )
    .join("")}
</section>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BMMP contact sheet — b1a-01x-ui-pass</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --muted:#555; --line:#d8d8d8; --panel:#f6f6f6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111; --fg:#f2f2f2; --muted:#a6a6a6; --line:#333; --panel:#1b1b1b; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 ui-sans-serif, system-ui, sans-serif; }
  header.page { padding:32px 24px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 8px; font-size:28px; }
  .lede { margin:0; max-width:72ch; color:var(--muted); }
  nav { padding:16px 24px; border-bottom:1px solid var(--line); display:flex; flex-wrap:wrap; gap:12px; position:sticky; top:0; background:var(--bg); z-index:2; }
  nav a { color:inherit; font-size:14px; }
  .group { padding:24px; border-bottom:1px solid var(--line); }
  .group > h2 { font-size:22px; margin:0 0 16px; }
  .screen { border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:24px; background:var(--panel); }
  .screen h3 { margin:0 0 4px; font-size:18px; }
  .meta, .note { margin:0 0 4px; font-size:14px; color:var(--muted); }
  .theme { margin-top:16px; }
  .theme h4 { margin:0 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  .pair { margin-bottom:16px; }
  .width { margin:0 0 4px; font-size:13px; color:var(--muted); }
  .cells { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .cell { margin:0; border:1px solid var(--line); border-radius:6px; overflow:hidden; background:var(--bg); }
  figcaption { padding:4px 8px; font-size:12px; color:var(--muted); border-bottom:1px solid var(--line); }
  .cell img { display:block; width:100%; height:auto; }
  .missing { display:flex; align-items:center; justify-content:center; min-height:120px; font-size:13px; color:var(--muted); }
  @media (max-width: 800px) { .cells { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header class="page">
  <h1>BMMP contact sheet</h1>
  <p class="lede">Every screen unit 01 built, in both themes, at 375px, 768px and 1440px, before and after the
  <code>b1a-01x-ui-pass</code> layout pass. Regenerate with <code>pnpm contact-sheet</code>. Click any image for it full size.</p>
</header>
<nav>${groups.map((group) => `<a href="#group-${escapeHtml(group.name.toLowerCase().replaceAll(" ", "-"))}">${escapeHtml(group.name)}</a>`).join("")}</nav>
${sections}
</body>
</html>
`;

  await writeFile(path.join("contact-sheet", "index.html"), html, "utf8");
  console.log(
    `→ contact-sheet/index.html — ${before.size} before, ${after.size} after`,
  );
}

/* ------------------------------------------------------------------- main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir("contact-sheet", { recursive: true });

  if (!args.indexOnly) {
    if (args.only === null) {
      await rm(path.join("contact-sheet", args.set), {
        recursive: true,
        force: true,
      });
    }
    const server = await startOwnServer(args.port);
    try {
      await capture(args, server.baseUrl);
    } finally {
      if (!args.keepServer) await server.stop();
    }
  }

  await writeIndex();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
