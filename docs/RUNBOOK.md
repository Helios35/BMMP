# Runbook / Operations — BMMP
**Version:** 1.0 · **Date:** 2026-08-11 · **Owner:** Nathan Ivy / Next Sketch LLC
**Answers:** How do we run BMMP in production — and what do we do at 2am when it breaks?
**Reads from:** `PROJECT_SETUP_BMMP.md` · `docs/TECHNICAL_SPEC.md` · `docs/ERD.md` · `docs/BUSINESS_RULES.md` · Roadmap v3.0 · SOW 1  ·  **Feeds:** `BMMP Planning/briefs/` (every build unit, outside the repository) · launch-readiness check · `docs/DECISION_LOG.md`

> ## REVIEW NOTES
> None open. All review notes for this document were answered on 2026-08-19 — see `Decision Log.md` **D-20** for the full disposition, and D-21 through D-26 for the calls that carry their own rationale. Content below is unchanged.

---

## 0. How to use this document

This is an operations manual, not a description. It is written to be read while something is wrong, by one tired person, so every section is scannable and every procedure is a numbered list.

**The principle that ranks everything below:** BMMP produces legal artifacts. An outage is visible — a handler cannot print a shipping paper and calls you. A *wrong* document is invisible — it prints, it looks right, it travels with a shipment, and nobody discovers the problem until an inspection or an audit, possibly years later. **A silent failure that produces a wrong or missing document is worse than an outage.** Alerting, severity, rollback rules and soak criteria in this document all follow from that sentence.

### First five minutes

| Symptom | Go to |
|---|---|
| Site is down or erroring broadly | §5.2 Vercel rollback, then §4 F-8 |
| A document printed without emergency response information or the 24-hour number | §4 F-1 — **stop shipments first** |
| A deployed environment might be running the mock adapter | §4 F-2 — **treat every document since the deploy as suspect** |
| An organization can see another organization's data | §4 F-3 — sev-1, contain before diagnosing |
| Storage-clock alerts have gone quiet | §4 F-4 |
| A migration failed halfway through | §4 F-5 |
| A battery is logged but its document will not generate | §4 F-6 |
| Intake is failing on the label-reading step | §4 F-7 |
| You just shipped something bad and need to undo it | §5 |

---

## 1. Deployment Process

### 1.1 Environments

| Environment | Source | Data adapter | Deploys how | Holds real customer data |
|---|---|---|---|---|
| Local | Working copy | `mock` (default) or `supabase` against a local/dev Supabase project | `pnpm dev` | No |
| Vercel preview | Any feature branch with an open PR | `mock` — always | Automatic on push | No |
| Vercel staging | `staging` branch | `supabase` — staging project | Automatic when CI passes | No — seeded and test data only |
| Vercel production | `main` branch | `supabase` — production project | CI passes, then **manual promotion in Vercel** | **Yes** |

Two rules that are not negotiable, both from `PROJECT_SETUP_BMMP.md` §6:

- **Code never reaches staging or production without passing CI first.** No manual overrides.
- **No agent merges its own work.** Every unit ends in a pull request whose diff Nate reads and merges by hand.

**Preview deployments always run the mock adapter.** A pull-request preview must never be able to read or write real compliance records. Adapter behaviour is exercised on staging, not in previews. See RN-4 for how this is enforced when staging and production share a Vercel project.

### 1.2 The standard path — feature branch to production

**D1. Branch.** Cut from `staging`. Name carries the unit ID from the sprint plan: `feature/b1a-03-label-intake-form`. One brief, one branch.

**D2. Build locally on `DATA_ADAPTER=mock`.** Screens and flows are developed against the mock adapter. Nothing outside `src/data/supabase/` and `src/lib/` imports `@supabase/*` — CI will fail the build if it does.

**D3. Author migrations, if the unit changes the schema.** Numbered file in `supabase/migrations/`, forward-only, no down migration. Apply locally and confirm the app still runs on both adapters. **One migration file does one thing** — never combine an addition and a removal.

**D4. Update `.env.example` in the same commit** if the unit adds an environment variable. This is a `PROJECT_SETUP_BMMP.md` §2 rule and it is the only thing preventing a deploy that is missing a variable nobody remembers exists.

**D5. Open a pull request into `staging`.** CI runs on every push:

```
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e            (DATA_ADAPTER=mock)
data-seam check          (zero @supabase/* imports outside src/data/supabase and src/lib)
```

All are required status checks. The data-seam check is what keeps the swap point real over 32 weeks rather than only on day one.

**D6. Nate reads the diff and merges by hand.**

**D7. Apply *additive* migrations to the staging Supabase project — before the deploy lands.** See §1.3 for the ordering rule and the exact commands.

**D8. Vercel auto-deploys `staging`.**

**D9. Verify on staging.** §1.5 checklist. Do not skip the adapter probe — it is the first item for a reason.

**D10. Open a pull request `staging` → `main`.** CI runs again against the merge result.

**D11. Nate merges to `main`.**

**D12. Apply *additive* migrations to the production Supabase project — before promoting.** Same commands, production project.

**D13. Promote manually in Vercel.** Vercel → project → Deployments → the `main` deployment that passed → **Promote to Production**. This step is deliberately manual. It is the last point at which a human decides.

**D14. Verify on production.** §1.6 checklist.

**D15. Apply *destructive* migrations — later, in a separate deploy.** Never in the same window as the code that stopped using the column. See §1.3.

**D16. Record.** Build-notes in `BMMP Planning/briefs/` for the unit. Any judgment call made along the way goes to `docs/DECISION_LOG.md`.

### 1.3 Database migrations and their order relative to a code deploy

Migrations in `supabase/migrations/` are **numbered and forward-only**. There are no down migrations. To undo a schema change you write a new migration that reverses it — which is why the ordering rule below matters so much: it is what makes a *code* rollback safe without a *schema* rollback.

**The rule, stated plainly:**

> **Migrations that ADD are applied BEFORE the code deploy. Migrations that REMOVE are applied AFTER — in a separate, later deploy.**

**Why.** An additive migration is invisible to the currently running code: a new nullable column, a new table, a new index, a new policy that grants access. Old code ignores it; new code needs it to exist the moment it starts serving. Applying it first means there is no window where new code is live against an old schema.

A destructive migration is the mirror image: a dropped column, a dropped table, a rename, a tightened `NOT NULL`, a narrowed policy. It breaks any code still expecting the old shape — including the *previous* deployment, which is your rollback target. Apply it only once the new code has been live and stable and you have accepted that you can no longer roll back past it.

| Change | When | Notes |
|---|---|---|
| New table | Before code deploy | Include its row-level security policies **in the same migration**. A table that exists without policies is a table with no tenant isolation. |
| New column, nullable | Before code deploy | |
| New column, `NOT NULL` | Before code deploy, **with a default**, then backfill, then tighten later | A bare `NOT NULL` add fails against existing rows. |
| New index | Before code deploy | Use a concurrent build on a table with real volume. |
| Policy that grants access | Before code deploy | |
| Backfill / data migration | Between the additive migration and the code deploy | Run it and confirm the row count before deploying. |
| Drop column or table | **After** code deploy, separate later deploy | |
| Rename anything | **Never as a rename** | Add the new, backfill, deploy code writing both and reading new, then drop the old in a later deploy. |
| Tighten a policy | **After** code deploy, separate later deploy | Exception: if the current policy is leaking data, tighten immediately — see F-3. |

**Commands.** Confirm which project you are pointed at *before* every push. This is the step where a tired person breaks production.

```
supabase link --project-ref <ref for the target environment>
supabase migration list        # local vs applied-on-remote — read this before and after
supabase db push               # applies pending migrations to the linked project
supabase migration list        # confirm every migration now shows applied
```

Migrations are applied one environment at a time, staging first, always in the same order they will run in production. A migration that has never been applied to staging does not go near production.

### 1.4 Pre-deploy checks

**The check that matters most is the adapter check.** `src/data/index.ts` selects the adapter like this:

```ts
export const data: DataAdapter =
  process.env.DATA_ADAPTER === 'supabase' ? supabaseAdapter : mockAdapter
```

That line **fails open to the mock**. Unset, empty, misspelled, `Supabase` with a capital S, `real`, `prod` — every one of them silently yields fake data. In production that means BMMP would happily generate shipping papers and container labels for batteries that do not exist, using an organization profile that is not real, and hand them to a user who has no way to tell. It is the single worst failure this product can have, and the code path to it is one string comparison.

**Understand what CI can and cannot do here.** GitHub Actions has no visibility into Vercel's environment variable values. CI *cannot* verify the production adapter. The guard therefore has to live in three places:

1. **Boot guard, in the deployed runtime.** A validator in `src/lib/` that runs at startup and **throws** — refusing to serve at all — when the deployment target is staging or production and `DATA_ADAPTER !== 'supabase'`, or when any required variable for that environment is missing. A deployment that will not start is loud. A deployment serving fake compliance documents is silent. Always choose loud.
2. **Health probe, checked by a human.** `GET /api/health` returns the active adapter name, the environment name and the commit SHA — and no secret values. This is step one of every staging and production verification, and it is the only step you may never skip.
3. **A visible marker in the UI.** When the mock adapter is active, a persistent banner on every screen saying so. Not a console log — a banner a person cannot miss.

Additionally, **every `document_render` row stamps the commit SHA and the active adapter** at generation time. This is not a nicety: it is the only thing that lets you answer "which documents did the bad version produce?" during a rollback (§5.4). Without it, that question has no answer and every document in the window becomes suspect.

**Before promoting to production, in order:**

```
[ ] CI green on main — lint, typecheck, test, build, e2e, data-seam
[ ] Additive migrations applied to production Supabase; supabase migration list clean
[ ] Destructive migrations NOT included in this deploy
[ ] vercel env ls  — read it; confirm DATA_ADAPTER=supabase on production
[ ] Staging verification (§1.5) passed on this exact commit
[ ] Rollback target identified — the currently promoted deployment, noted by URL
```

### 1.5 Staging verification checklist

```
[ ] GET /api/health → adapter: "supabase", env: staging, commit matches what you merged
[ ] Sign in as a test handler (P1)
[ ] Log a battery through /batteries/new — photo, extraction review, confirm
[ ] A low-confidence field routes to /review and does not auto-commit
[ ] Generate a shipping paper; open the PDF and read it:
        emergency response information present
        24-hour emergency number present and correct
        classification decision and its recorded reasoning present
[ ] Generate a container label; storage start date correct
[ ] /containers shows a running storage clock
[ ] Sign in as a second test organization — confirm zero records from the first are visible
[ ] /audit shows the events from everything above
[ ] Vercel logs clean for the run; no unhandled server errors
```

### 1.6 Production verification checklist

Run immediately after promotion. Under five minutes.

```
[ ] GET /api/health → adapter: "supabase", env: production, commit is the one promoted
[ ] No mock banner anywhere in the UI
[ ] Sign in; dashboard loads with real data
[ ] Open one existing battery record and one existing document — both render
[ ] Generate one document in a designated internal test organization, and read the PDF
[ ] Error tracker and Vercel logs: no new error class since promotion
[ ] Storage-clock job: last run recorded within its expected window
```

If the document in step 5 is wrong in any way, stop and go to §5.

### 1.7 Hotfix path

A hotfix is still a pull request and still passes CI. The only thing that changes is the branch source: cut from `main`, merge to `main`, then back-merge into `staging` the same day so the branches do not diverge. Skipping staging verification is permitted for a hotfix only when the fault is already causing a sev-1 and the fix is small enough to read in full. Note the exception in `BMMP Planning/briefs/` — an undocumented skipped gate becomes normal practice within a month.

---

## 2. Environment Variables

Every variable in `PROJECT_SETUP_BMMP.md` §2. Anything prefixed `NEXT_PUBLIC_` is visible in the browser — **never put a secret behind that prefix**. Every new variable is added to `.env.example` in the same commit that introduces it.

The "Supabase" column means the value originates from, or must also be configured in, the Supabase project — not that the Next.js app reads it from there.

| Variable | What it does | Secret | Local | Vercel preview | Vercel staging | Vercel production | Supabase |
|---|---|---|---|---|---|---|---|
| `DATA_ADAPTER` | **The mock/real switch.** `supabase` runs the real data layer; anything else runs the in-memory mock. | No | `mock` | `mock` — always | **`supabase`** | **`supabase`** | — |
| `NEXT_PUBLIC_SUPABASE_URL` | Project API endpoint the browser and server clients call. | No — public by design | Local/dev project URL | Unset or dev | Staging project URL | Production project URL | Value comes from the project's API settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-side key. Carries no privilege of its own — **it is safe only because row-level security is enabled on every table.** | No — public by design, but see the warning below | Local/dev | Unset or dev | Staging | Production | From project API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key that **bypasses row-level security entirely**. The highest-value secret in the project. | **Yes — highest** | `.env.local` only | **Never set** | Staging value | Production value | From project API settings |
| `VISION_API_KEY` | Authenticates the label-reading calls in the intake pipeline. Carries direct spend. | **Yes** | `.env.local` | Unset — previews run on mock and make no vision calls | Staging value (may be the same account, separate key) | Production value | — |
| `VISION_MODEL` | Which model the intake pipeline calls. Lets a model be swapped without a code change. | No | Set | Unset | Set | Set | — |
| `NHTSA_RECALL_BASE_URL` | Base URL for the government recall lookup used by `recall_match`. **Phase B2** — set but unused in B1a. | No | Set | Unset | Set | Set | — |
| `NEXT_PUBLIC_APP_URL` | The app's own canonical URL. Used in absolute links, invite emails and auth redirects. | No | `http://localhost:3000` | Preview URL | Staging URL | Production domain | **Must match the Auth Site URL and redirect allow-list in the matching Supabase project** |

### 2.1 `DATA_ADAPTER` — read this before touching it

`DATA_ADAPTER` **must be exactly `supabase` in staging and in production.** Lower case, no whitespace, no other spelling.

A production deploy running the mock adapter does not error, does not slow down and does not look wrong. It serves invented batteries, invented organizations and invented containers, and it will generate shipping papers and container labels from them — documents that look completely legitimate and describe nothing that exists. A handler could attach one to a real shipment. That is the worst outcome available to this product, and it is worse than the site being down for a day.

The pre-deploy check that catches it is in §1.4: a **boot guard that refuses to start**, a **`/api/health` probe read by a human as the first verification step**, a **mock banner in the UI**, and a **commit SHA plus adapter stamped on every `document_render`**. Four layers, because a single string comparison decides it.

**One further trap.** `process.env.DATA_ADAPTER` has no `NEXT_PUBLIC_` prefix, so it is server-only. If `src/data/index.ts` is ever imported into a client component, that expression evaluates to `undefined` in the browser bundle and silently selects the mock — in production, on a correctly configured environment. The data layer is server-side only. If a client component needs data, it comes through a server component or a route handler.

### 2.2 Secret handling and rotation

- Secrets live in `.env.local` locally and in Vercel's environment variable store for deployed environments. Never in the repo, never in a commit message, never in a screenshot pasted into a chat.
- `SUPABASE_SERVICE_ROLE_KEY` is never set on preview, never sent to the browser, and never used from a client component. If it leaks, an attacker reads and writes every tenant's records with no restriction.
- **Rotation, service-role key:** generate a new key in the Supabase dashboard → update Vercel (production, then staging) → redeploy → verify `/api/health` → revoke the old key. Rotate on any suspected exposure, on any change in who has access, and at handover (§6).
- **Rotation, vision key:** issue a new key at the provider → update Vercel → redeploy → verify one intake end-to-end → revoke the old. A leaked vision key is a spend problem before it is a data problem, which is why the spend cap in RN-5 matters.
- After any rotation, re-run the §1.6 production checklist. A rotation that half-applied looks exactly like an outage.

---

## 3. Monitoring

This is a solo-owner product. Monitoring has to be **cheap** and **low-noise**, because the only escalation path is one person's phone, and an alert that cries wolf three times gets muted — after which the product has no monitoring at all, only the appearance of it.

**The governing rule:** every alert names an action. If the answer to "what do I do when this fires?" is "look at it," it is not an alert, it is a dashboard line. Any alert that fires more than once a week without a human doing something gets tuned or deleted at the weekly review.

Tooling is not yet chosen — see RN-2 and RN-3. What follows is what must be watched regardless of which tools are picked.

### 3.1 Severity ladder

| Tier | Meaning | Response |
|---|---|---|
| **Sev-1 — wake me up** | A wrong or invalid legal document may have been produced, or one tenant's data is reachable by another, or the product is fully down. | Immediately, any hour. Contain first, diagnose second. |
| **Sev-2 — same working day** | Users are blocked or degraded, but nothing invalid has been produced and no data has crossed a tenant boundary. | Within working hours. |
| **Sev-3 — look at it tomorrow** | Something is wrong that has not yet affected a user, or a cost or capacity trend is heading somewhere bad. | Daily digest; handled next working day. |

Sev-1 is deliberately narrow. Three things earn it: **an invalid document, a tenant boundary crossing, a full outage.** Note that "an invalid document" outranks "the whole site is down" in this document's ordering, because the outage stops when you fix it and the document keeps travelling.

### 3.2 What is watched

| # | Signal | What fires | Tier | What the person does |
|---|---|---|---|---|
| M1 | **Document validity** — every `document_render` passes a required-fields validator at generation time: emergency response information present, 24-hour emergency number present, classification decision and its recorded reasoning present, storage start date on container labels | Any single validation failure, **and** any document that rendered without the validator running | **Sev-1** | F-1. Stop shipments on the affected records first. |
| M2 | **Active data adapter** — `/api/health` probed externally on a schedule | Adapter is anything other than `supabase` on staging or production | **Sev-1** | F-2. Treat every document since the deploy as suspect. |
| M3 | **Tenant isolation** — the data layer asserts that every returned row belongs to the caller's organization; violations are logged, and unexpected permission-denied spikes are counted separately | Any single assertion violation | **Sev-1** | F-3. Contain before diagnosing. |
| M4 | **Uptime** — external check against a real page, not just a TCP handshake | Two consecutive failed checks | **Sev-1** | F-8, then §5. The check must be hosted outside Vercel, or an outage silences its own alarm. |
| M5 | **Storage-clock job heartbeat** — the sweep records an `audit_event` on every run and pings an external heartbeat on success | One missed window: Sev-3. Two consecutive missed windows, or heartbeat silent beyond 26 hours: Sev-1 | **Both** | F-4. Alerting on *absence* is the whole point — see the note below. |
| M6 | **Document generation failures** — errors thrown during render, as distinct from invalid output | Any failure: Sev-2. Three or more in an hour, or any failure on a battery already logged and awaiting shipment: Sev-1 | **Both** | F-6 |
| M7 | **Vision-model API failures** — error rate and latency on the label-reading step | Error rate above 20% over 15 minutes, or any sustained rate-limit response | **Sev-2** | F-7. Intake degrades to manual entry via `/review`. It does not stop. |
| M8 | **Vision-model cost** — spend against the monthly cap | 50% of cap: Sev-3. 80%: Sev-2. 100%: Sev-1, because intake stops | **All three** | Check volume against expected intake. A cost spike with flat intake volume means a retry loop or a leaked key. |
| M9 | **Supabase connection pool** — active connections against the project limit | Above 80% for 5 minutes | **Sev-2** | F-8 |
| M10 | **Row-level security anomalies** — permission-denied counts by table | A sustained spike, or any denial on a table that should be readable in normal use | **Sev-2** | Usually a policy or a bug, not a breach. A denial that *should* have happened but did not is M3, and that is sev-1. |
| M11 | **Unhandled server error rate** | Above 2% of requests over 10 minutes, or any new error class appearing within 30 minutes of a deploy | **Sev-2** | Post-deploy spikes are rollback candidates. §5.1. |
| M12 | **Auth failures** — sign-in and invite redemption failure rate | A sharp rise, especially right after a deploy or a domain change | **Sev-2** | F-9 |

**On M5 and alerting on absence.** Every other signal in this table fires because something *happened*. M5 fires because something *did not*. A scheduled job that stops running produces no errors, no log lines and no user complaints — it produces silence, and silence is indistinguishable from health unless you have arranged for it not to be. The storage clock drives the 30/60/90-day alerts on a one-year clock, so a facility manager (P2) will not notice missing alerts until the day a container is out of compliance. This is the highest-consequence quiet failure in the product and it needs a heartbeat that lives outside the system.

### 3.3 Rhythm

- **Daily, five minutes:** the digest — sev-3 items, yesterday's document generation count and validity pass rate, storage-clock runs, vision spend to date.
- **Weekly, thirty minutes:** error trends, alerts that fired without action (tune or delete), pool headroom, spend against cap, and one spot-check — open a document generated that week and read it end to end. A validator can only check what it was told to check; a human reading a PDF catches what nobody thought to assert.
- **At every gate:** re-run this section against what has actually shipped. Monitoring written for B1a does not cover B1b's obligation deadlines or B2's grading.

---

## 4. Common Failure Modes

Ranked by how much damage they do before anyone notices, not by how often they happen. The first three are silent. That is why they are first.

---

### F-1 — A rendered document is missing emergency response information or the 24-hour emergency number

**Severity:** Sev-1. **Why it is first:** the document is legally invalid, it looks fine, and it may already be travelling with a shipment.

**Symptoms.** M1 fires. Or a user, an inspector or a carrier reports a document that is missing a section. Or a spot-check finds it.

**Confirm.** Open the actual PDF from `/documents/[id]` — do not trust the record, read the rendered artifact. Check for: emergency response information, the 24-hour emergency number, the classification decision with its recorded reasoning, and the correct organization identity.

**Contain, in this order.**
1. Identify the affected `document_render` rows by commit SHA and time window.
2. Determine which are attached to a shipment that has already moved. Those are the urgent ones — the paper is physically in a truck.
3. Notify the affected organizations immediately with the specific document IDs and instructions to stop using them.
4. If the fault is in the current deploy, roll back (§5). If it is a data fault — a missing emergency number on the organization or jurisdiction profile — disable generation for the affected profile rather than let it produce more.

**Fix.** Correct the template or the data. Add the missing field to the M1 validator so this exact failure can never render silently again. Regenerate corrected documents as **new** `document_render` rows, and mark the bad ones superseded with a stated reason. **Do not delete them** — §5.4.

**Prevent.** The validator runs at generation time and blocks the render, rather than reporting afterwards. Golden-file tests over the PDF output for every document type, asserting the presence of every legally required field. A missing-field defect that reaches production means the golden file did not cover that field — add it in the same fix.

---

### F-2 — `DATA_ADAPTER` misconfigured in a deployed environment

**Severity:** Sev-1.

**Symptoms.** M2 fires. Or the mock banner appears in a deployed environment. Or — the way this is usually found — a user says their batteries are gone and there are records they do not recognise.

**Confirm.** `GET /api/health` on the affected environment. `vercel env ls` for that environment. Check the variable's exact value — capitalisation and trailing whitespace both cause this.

**Contain.**
1. **Assume every document generated since the deploy is fabricated.** Pull the `document_render` rows stamped with that commit SHA and adapter.
2. Notify affected organizations immediately with the specific document IDs. These documents describe batteries that do not exist.
3. Set `DATA_ADAPTER=supabase` in Vercel and redeploy — a change to an environment variable does **not** apply to a running deployment.
4. Re-verify `/api/health` before telling anyone it is fixed.

**Fix.** Correct the value, redeploy, run the §1.6 checklist in full. Then find out how it happened — a missing variable on a newly created Vercel project, a typo, an environment variable set on the wrong scope, or a fresh environment created without copying the full set.

**Prevent.** The boot guard in §1.4. If the guard existed and did not fire, the guard is broken and that is now the sev-1.

---

### F-3 — One organization can see another organization's data

**Severity:** Sev-1. **Contain before you diagnose.** A leak that is still open while you investigate is a leak you chose to leave open.

**Symptoms.** M3 fires. Or a user reports a battery, container or document they do not recognise. Or a record count is wrong on a dashboard.

**Contain — first ten minutes.**
1. **Reproduce once**, minimally, to confirm it is real. One attempt.
2. **Close the surface immediately.** If it arrived with a deploy, roll back (§5.2) — fastest available action. If it is a policy gap, apply a forward migration that denies by default on the affected table, or revoke the anon role's access to it. **This breaks the feature for everyone.** That is the correct trade: a broken feature is recoverable, a disclosed record is not.
3. **Preserve evidence.** Snapshot the relevant logs and `audit_event` rows before anything expires or rotates. Do not clean up.
4. **Scope it.** From `audit_event`, determine which organizations, which records, which users, and over what window.

**Then.** Fix the policy or the query. Add a regression test that asserts the boundary. Add the case to the staging checklist. Notify Jonathan the same day with the scope, in writing — breach-notification obligations are a legal question for the client, not a technical one, and the client cannot meet an obligation they have not been told about. Write it up in `docs/DECISION_LOG.md` and update this runbook.

**Prevent.** Row-level security policies ship in the same migration as the table they protect. The data layer asserts the organization on every returned row as defence in depth — policies are the control, the assertion is the alarm. Every deploy's staging checklist includes the two-organization visibility check.

---

### F-4 — The storage-clock job silently stops running

**Severity:** Sev-3 for one missed window, Sev-1 for two consecutive or a heartbeat silent beyond 26 hours.

**Symptoms.** There are none. That is the failure mode. No errors, no complaints, no dashboard change. The 30/60/90-day alerts on a one-year clock simply never fire, and the first visible sign is a container out of compliance — potentially months later, in front of a fire marshal or an insurer.

**Confirm.** Check for a storage-clock `audit_event` in the expected window. Check the scheduler's own execution log. Check whether the job is running but producing zero alerts — a job that runs and finds nothing looks identical to a job that never ran, unless it records the run itself.

**Fix.**
1. Run the sweep manually to catch up.
2. Determine the missed window and which clocks should have alerted during it. Notify affected facility managers (P2) with the corrected state — do not just quietly send the backlog, because a burst of alerts with no explanation reads as a bug and gets ignored.
3. Fix the scheduler fault.
4. Confirm the heartbeat is reporting again before closing.

**Watch for a false negative:** the job runs, completes, and computes nothing because of a timezone or date-boundary bug — the clock is running against the wrong day, so no threshold is ever crossed. `PROJECT_SETUP_BMMP.md` §1 anticipates exactly this with its `fix/b1a-07-storage-clock-timezone` branch example. Storage clocks are day-granularity legal deadlines; an off-by-one is a compliance defect, not a display bug. Unit tests in `src/domain/` must cover boundary days across timezones.

**Prevent.** Heartbeat on success (RN-3), and an `audit_event` on every run whether or not it found anything to alert on. A run that produces no output must still produce evidence that it ran.

---

### F-5 — A Supabase migration partially applied

**Severity:** Sev-2, or Sev-1 if the schema is now incompatible with running code.

**Symptoms.** `supabase db push` errored mid-run. Queries fail on a column that does or does not exist. `supabase migration list` shows a mismatch between local and remote.

**Confirm.** `supabase migration list` against the affected project. Inspect the actual schema for the objects the migration should have created. Migrations are forward-only, so there is no down migration to run and no automatic recovery — this must be resolved by hand.

**Fix.**
1. **Stop deploying.** Do not promote code that assumes the full migration applied.
2. Establish exactly what exists. Compare object by object against the migration file.
3. If code is already live against the broken schema and failing, roll the code back first (§5.2), then repair the schema without time pressure.
4. Write a **new forward migration** that brings the schema to the intended state and is safe to run against the partial state — guard every statement with `if not exists` / `if exists`.
5. Apply to staging first. Confirm. Then production.
6. Re-run §1.6.

**Prevent.** One migration file does one logical change. Wrap multi-statement changes in a transaction where the operation permits it. Always apply to staging first — a migration that fails halfway in staging is a Tuesday afternoon; the same migration in production is this section.

---

### F-6 — Document generation fails after the battery is already logged

**Severity:** Sev-2. Sev-1 if the shipment is time-critical or the same failure is repeating across records.

**Symptoms.** M6 fires. A handler (P1) reports an error at the point of printing. The `battery_record` exists, the `document_render` does not.

**Why it is worse than it looks.** The user has done the work. The battery is logged and physically present, possibly already in a container, possibly with a truck waiting. Failing at the last step means the shipment cannot legally move.

**Confirm.** Reproduce from `/documents/[id]` or by regenerating on the affected record. Read the error. The usual causes: a missing field on the organization or jurisdiction profile, a jurisdiction rule with no matching `rule_version`, a `classification_decision` that never completed, a PDF template error, or a storage write failure.

**Fix.**
1. Establish whether it affects **one record** or **all generation**. All generation is a rollback candidate — go to §5.1.
2. For a single record: find the missing input, fill it, regenerate, confirm the PDF is complete and valid.
3. Tell the user directly. They are standing next to a battery they cannot ship.
4. If the cause is a missing jurisdiction rule, that is a data gap, not a code bug — add the rule as data. **Never patch it with a hard-coded threshold, deadline or citation.** That is a review rejection under `PROJECT_SETUP_BMMP.md` §8.1, and it is still a review rejection at 2am.

**Prevent.** Validate every input the document engine needs *before* the intake flow completes, not at print time. A record that cannot produce a document should be blocked at the point of logging, where the user still has the battery, the label and the context in front of them.

---

### F-7 — The vision-model provider is down, slow or rate-limited during intake

**Severity:** Sev-2.

**Symptoms.** M7 fires. Intake stalls at the label-reading step. Timeouts or rate-limit responses in the logs. Possibly a cost spike alongside, if retries are looping.

**What correct degraded behaviour looks like.** The intake pipeline is sequential and code-orchestrated with a human gate at the end. When label reading is unavailable, the pipeline does not fail the record — it routes it to `/review` with no extracted values, where a handler enters the label fields manually. Intake slows down. It does not stop, and it does not lose data.

**Fix.**
1. Check the provider's status page and your own rate-limit headroom.
2. If rate-limited, confirm it is real demand and not a retry loop. A retry loop is both the cause and the cost spike.
3. If the outage is sustained, switch `VISION_MODEL` to the fallback model and redeploy. This is precisely why the model is a variable and not a constant.
4. Tell affected users that intake requires manual entry right now, and roughly for how long.
5. When the provider recovers, the queued records in `/review` are completed normally.

**Three things you must not do.**
- **Do not lower the confidence threshold to clear a backlog.** The confidence gate is a hard rule, not a tunable default. Any field below threshold routes the whole record to `/review`.
- **Do not auto-accept extracted values to keep the queue moving.** Nothing auto-commits an unconfirmed chemistry, model or condition. Chemistry is matched from the catalog and confirmed by a human — it is never inferred from the image.
- **Do not drop the record.** A record that cannot be read is a record that waits for a human, not a record that disappears.

**Prevent.** Bounded retries with backoff, a circuit breaker that stops calling a provider that is clearly down, a queue that survives the outage, and the spend cap in RN-5.

---

### F-8 — Supabase connection pool exhausted, or the database is unreachable

**Severity:** Sev-2 at saturation, Sev-1 at full outage.

**Symptoms.** M9 or M4 fires. Broad timeouts. "Too many connections" or connection-acquisition errors across unrelated features.

**Confirm.** Supabase dashboard: active connections against the limit, slow query log, current load. Check whether it correlates with a deploy, a scheduled job, or genuine traffic.

**Fix.**
1. If it started with a deploy, roll back (§5.2) — a connection leak in new code is the most common cause and rollback is faster than finding it.
2. If a scheduled job is holding connections, stop the job.
3. Confirm the app uses the pooled connection string for serverless functions. A serverless runtime opening direct connections will exhaust any pool at modest traffic.
4. Once stable, find the leak: a client created per request instead of reused, a query without a limit, a missing index turning a fast query into a long one.

**Prevent.** Supabase clients are created in `src/lib/` and reused. Every list query is paginated. Indexes exist for every filter used by `/batteries`, `/containers`, `/shipments` and `/audit`. Pool headroom is a soak criterion (§7).

---

### F-9 — Auth redirects to the wrong environment, or sign-in breaks after a domain change

**Severity:** Sev-2.

**Symptoms.** M12 fires. Sign-in or an invite link bounces to `localhost`, to a preview URL, or to staging from production. Invite redemption at `/invite/[token]` fails.

**Cause, almost always.** `NEXT_PUBLIC_APP_URL` does not match the Site URL and redirect allow-list configured in the corresponding Supabase project — the two are set in different places and drift when a domain changes or a new environment is created.

**Fix.** Set `NEXT_PUBLIC_APP_URL` correctly in Vercel for that environment, **and** update the Site URL and redirect allow-list in the matching Supabase project. Redeploy — environment variable changes do not reach a running deployment. Test a full sign-in and one invite redemption.

**Prevent.** These two settings change together, always, in the same session. A domain change is a two-system change and gets its own checklist entry.

---

## 5. Rollback Procedure

### 5.1 Roll back or fix forward

**Roll back immediately, before diagnosing, if any of these are true:**

- A wrong, invalid or fabricated document may have been produced (F-1, F-2).
- One tenant's data is reachable by another (F-3).
- Document generation is failing broadly (F-6 across records).
- The site is down or badly degraded and the previous version was fine.

In every one of those cases the cost of an extra ten minutes of investigation is measured in legal artifacts or disclosed records. Rollback is one click and is almost always reversible. Take it first and diagnose from a safe state.

**Fix forward instead when:**

- The fault is cosmetic or confined to a surface that produces no document and exposes no data.
- The previous version has the same defect — rolling back gains nothing.
- A destructive migration has already been applied, so the previous version cannot run against the current schema (§5.3).
- The fix is small, understood, and reviewable in full in less time than the rollback and re-verification would take. Be honest about this one; under pressure, "small and understood" is the most over-claimed sentence in operations.

**When in doubt, roll back.** This product's worst outcomes are silent and permanent. Its recovery path is a redeploy.

### 5.2 Rolling back a Vercel deployment

**Production.**
1. Vercel → project → **Deployments**.
2. Find the last known-good production deployment. If you noted the rollback target during pre-deploy (§1.4), it is that one.
3. **Promote to Production**. This is instant — it repoints traffic, it does not rebuild.
4. Verify with §1.6, starting with `/api/health` and the commit SHA. Confirm the SHA is the *old* one.
5. Confirm the fault is gone by reproducing the original symptom.
6. Note the time of both the bad promotion and the rollback. You need this window for §5.4.

**Staging.** Revert the merge commit on `staging` and let CI redeploy. Staging is not worth a manual promotion dance.

**Important:** rolling back code does **not** roll back environment variables and does **not** roll back the database. If the fault was an environment variable (F-2), fix the variable and redeploy — a rollback alone will not help, because the old deployment reads the same variable store.

### 5.3 Rolling back when a migration has already been applied

Migrations are forward-only. There is no rollback of a migration — there is only a new migration forward.

**If only additive migrations were applied** — which is the normal case if §1.3 was followed — **the code rollback is safe with no schema work at all.** The previous version does not know the new column exists and does not care. This is the entire reason the ordering rule exists: it keeps the previous deployment a valid rollback target.

**If a destructive migration was applied**, the previous version cannot run against the current schema. You have three options, in order of preference:

1. **Fix forward.** Usually correct. Ship a corrected version rather than trying to reconstruct a schema.
2. **Re-add the removed structure with a new forward migration**, then roll the code back. Only viable if the data is still recoverable — if a dropped column took its data with it, re-adding the column gives you an empty column, which for a compliance record may be worse than the bug you were fixing.
3. **Restore from a point-in-time backup.** Last resort, causes data loss for everything written since that point, and for a product of record that data loss may itself be the incident. Never do this without first exporting the current state and writing down the exact restore point and what will be lost.

**The rule this leads to:** never ship a destructive migration in the same deploy as the code that stops using the structure. The gap between them is your rollback window, and you should not close it until the new code has been live and stable — at minimum a full working day, and for anything touching documents or `shipment` records, longer.

### 5.4 Documents already generated by the bad version

**These are legal artifacts. They are not deleted.** A `shipment` record carries a three-year retention obligation, and a document that has travelled with a shipment exists in the physical world regardless of what the database says. Deleting the record destroys the evidence trail that the audit and evidence layers exist to preserve — and deleting evidence after an error is a materially worse posture than having made the error.

**Procedure.**

1. **Establish the window.** From the bad promotion to the rollback, by timestamp.
2. **Identify.** Query `document_render` for that window, filtered by the bad commit SHA and adapter — which is why §1.4 stamps both. Include every document type: `shipping_paper`, `container_label`, and anything else rendered in the window.
3. **Assess each one.** Materially wrong (missing a legally required field, describing a battery that does not exist, wrong organization, wrong classification), or unaffected. Record the determination per document — a spreadsheet is fine, but it goes into the incident record.
4. **Mark the affected rows superseded**, with a stated reason and a link to the corrected document. The exact status value belongs to the Taxonomy doc; retention rules belong to Business Rules §12. Nothing is removed.
5. **Regenerate.** Each correction is a **new** `document_render` with a new ID on the corrected code. Never regenerate in place — that overwrites history and destroys the ability to show what was produced when.
6. **Notify the affected organizations directly**, with specific document IDs and clear instructions. If a document has already travelled with a shipment, the physical copy has to be retrieved or replaced by the handler, and only they can do that. Tell them which shipments, not just which documents.
7. **Log everything to `audit_event`** — identification, supersession, regeneration, notification. An auditor reading this later must be able to see that the error was found, scoped, corrected and disclosed.
8. **Tell Jonathan the same day**, in writing. Whether any of this is externally reportable is a legal question for the client, and they cannot answer a question they have not been asked.

---

## 6. Access and Credentials

The map of who holds what — **not the credentials themselves**. No key, token, password or recovery code appears in this document or anywhere else in the repository.

| System | What it holds | Who has access today | Notes |
|---|---|---|---|
| **GitHub** — `bmmp` repository | All source, migrations, CI configuration, the doc stack | Nathan Ivy (owner) | Sole admin. Branch protection on `main` and `staging`: PR required, status checks required, force-push and deletion blocked. Client access not granted as of this version — RN-1. |
| **Vercel** — BMMP project(s) | Hosting, deployments, **all deployed environment variable values including `SUPABASE_SERVICE_ROLE_KEY` and `VISION_API_KEY`** | Nathan Ivy (owner) | Production promotion is manual and only Nate can perform it. Highest-value account after Supabase. |
| **Supabase** — BMMP project(s) | The database, auth, storage, row-level security policies, service-role key. **Every customer's compliance records.** | Nathan Ivy (owner) | The most sensitive system in the engagement. Whether staging and production are separate projects is RN-4. |
| **Vision-model provider** | API key, model access, billing and spend cap | Nathan Ivy (owner) | Provider not yet named — RN-5. Carries direct spend, so it needs a cap regardless of which provider is chosen. |
| **Domain / DNS** | The production domain behind `NEXT_PUBLIC_APP_URL` | Not yet confirmed — RN-1 | Must be confirmed and, at handover, must end up registered to the client. A domain left in the builder's name after delivery is a live dependency on one person. |
| **Client-held (Jonathan)** | Terms of Service and the data-training rights grant; the client legal entity used for producer registration in B1b; the customer relationships; legal and financial obligations under SOW §9 | Jonathan | The training-rights grant must be in force *before* the first battery is logged. Every battery logged beforehand is permanently unusable for training. |
| **Tenant customer data** | Each customer organization's own records inside Supabase, scoped by row-level security | The organizations themselves, via `membership` roles | Customers hold no infrastructure access. Their access is entirely in-product. |

**Access principles.**

- One owner, no shared logins. Every account is under Nathan Ivy / Next Sketch LLC with individual credentials and multi-factor authentication.
- Credentials live in a password manager. Nowhere else — not in the repo, not in a note, not in chat history.
- The service-role key is the crown jewel: it bypasses row-level security entirely and reads every tenant's data. Treat any exposure of it as a sev-1 and rotate immediately (§2.2).
- No third party gets standing access. Time-boxed and revoked, or not granted.

**Break-glass.** Today there is none: one person holds every credential, and the product is live across the 14–25 Dec 2026 holiday break and any illness or travel. This is a real single point of failure for a product other companies depend on for compliance documents — RN-6.

**Handover at delivery — 30 April 2027.** SOW §8 transfers all work product, code, designs, documentation and deliverables to the Client on payment for the period in which the work was performed. **There is currently no plan for how the operational accounts follow the work product**, and the SOW's client entity and signatory are still blanks (Roadmap §7, open decision 3), which means there is no named legal party to transfer anything to. Transferring a repository is trivial; transferring a live Supabase project holding other companies' compliance records — with an active service-role key, an active vision-model account with a billing relationship, a domain, and customers mid-storage-clock — is not. It needs an owner, a date, a sequence, a credential-rotation step at the boundary, and a decision about what access Next Sketch retains afterwards and for how long. **This is RN-1 and it should be settled at Gate 2 in December 2026, not discovered in the April delivery window.**

---

## 7. Stability Soak

The roadmap requires a **72-hour stability soak** twice: in Gate 1 hardening week (12–16 Oct 2026) and again at final acceptance (12–30 Apr 2027). SOW §11 states it as an acceptance criterion: *"each live platform is demonstrably stable over a 72-hour pre-launch soak."*

### What a soak is

72 consecutive hours on the **production configuration** — `DATA_ADAPTER=supabase`, production environment variables, real infrastructure — with realistic usage: a real user completing real tasks, supplemented by scripted synthetic activity across the intake, document and storage-clock paths so the quiet hours are not empty hours.

**No deploys during the window.** A deploy resets the clock to zero. The point is to prove that a specific build survives three days unattended, and a build that was changed on hour 50 has not proven that.

### What is watched

| Watched | Recorded |
|---|---|
| Uptime | Every external check result, with any failures |
| Unhandled server error rate | Rate over the window, and every distinct error class |
| **Document generation** | Every render attempt: success/failure, and validator result on every generated document |
| **Document validity** | Zero validator failures — and a human reads a sample of the actual PDFs |
| **Scheduled storage-clock job** | Every scheduled window accounted for: ran, completed, recorded an `audit_event`, pinged the heartbeat |
| Vision-model calls | Failure rate, latency distribution, total spend over the window |
| Supabase connection pool | Peak and sustained usage against the limit |
| **Tenant isolation** | Zero assertion violations, zero unexplained permission-denied anomalies |
| Latency | p95 on the intake flow and on document generation |
| Stability of the runtime | No unexplained restarts, no memory growth trend, no queue backlog growth |

### Pass criteria

All of the following, or it is not a pass:

```
[ ] 72 consecutive hours with no deploy
[ ] Zero sev-1 events of any kind
[ ] Zero invalid documents — every generated document passed the required-fields
    validator, AND a human read a sample and confirmed emergency response information
    and the 24-hour emergency number are present and correct
[ ] Zero tenant-isolation violations
[ ] Every scheduled storage-clock run accounted for — no missed windows
[ ] Unhandled server error rate below 1% across the window
[ ] Uptime at or above 99.5% across the window
[ ] Connection pool peak below 80% of limit
[ ] Vision-model failure rate below 5%, spend within the expected range for the volume
[ ] No unresolved sev-2 open at the end of the window
[ ] p95 latency on intake and document generation within agreed targets
```

**On failure:** fix the cause, then **restart the 72 hours from zero.** A soak that was interrupted and resumed proves nothing about three unattended days. Say so plainly at the gate — a restarted soak is a normal outcome, and a soak declared passed after a mid-window fix is how a defect reaches a real user.

**Record the result** as a dated soak record: window start and end, the commit SHA under test, every metric above, and every event that occurred. It is gate evidence, and at final acceptance it is contract evidence against SOW §11.

---

## 8. Keeping this document true

A runbook decays faster than any other document in the stack, because it describes reality rather than intent and reality changes on every deploy.

- **Every incident adds or amends a failure mode here, in the same session it is resolved.** If the fix is not written down, the next occurrence costs the same as the first.
- **Every gate re-reads §3 and §7** against what has actually shipped. Monitoring written for B1a does not cover B1b's producer obligations or B2's grading.
- **Every new environment variable updates §2 and `.env.example`** in the same commit that introduces it.
- **Every alert that fires without producing an action gets tuned or deleted** at the weekly review. An ignored alert is worse than no alert, because it looks like coverage.

---

*Next Sketch LLC · Confidential · August 2026*
