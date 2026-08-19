# UX / Design Spec — BMMP
**Version:** 1.0 · **Date:** 2026-08-11 · **Owner:** Nathan Ivy / Next Sketch LLC
**Answers:** How will it look and behave — every screen, every component state, every empty and failure case?
**Reads from:** `SITE_ARCHITECTURE.md` · `_ANCHORS.md` · `PROJECT_SETUP_BMMP.md` · `PRD.md` · `BUSINESS_RULES.md` · `TAXONOMY.md`  ·  **Feeds:** builder briefs · `TECHNICAL_SPEC.md` · user stories and validation walkthroughs

> ## REVIEW NOTES
> None open. All review notes for this document were answered on 2026-08-19 — see `Decision Log.md` **D-20** for the full disposition, and D-21 through D-26 for the calls that carry their own rationale. Content below is unchanged.

---

## 0. How to read this document

**Scope.** B1a. One screen spec per route in the FIXED page list (`_ANCHORS.md` §5). Twenty routes, twenty specs.

**What this document owns.** Appearance, behaviour, component states, responsive rules, empty and error states, motion.

**What it does not own.** Status and category *values* → `TAXONOMY.md`. Decision logic → `BUSINESS_RULES.md`. Structure and access → `SITE_ARCHITECTURE.md`.

**Citation convention.** `Rule n.m` = that numbered rule in `BUSINESS_RULES.md`; `BR §n` = the whole section. Section numbers are FIXED per `_ANCHORS.md` §4. **This document renders decisions; it never makes one.** Where a screen shows an outcome, the rule that produced it is cited so a builder knows which behaviour is theirs to implement and which is theirs to display.

**Who this is built for.** Two environments, both hostile to decorative design:

1. **A warehouse.** Standing, gloved, in mixed lighting — fluorescent overhead, daylight through an open bay door, shadow behind a pallet rack. Distances of 60–80cm from a laptop or a wall-mounted screen.
2. **A phone in a storage room.** One hand, often no signal, sometimes in a respirator or safety glasses, sometimes with the screen at an angle.

**Therefore, and this is not a style preference:** large touch targets, high-contrast status colour, text labels on every status, no hover-only affordance, no information carried by colour alone, no decorative motion, no low-contrast "muted" text on anything a user must read to act. **Legibility beats elegance in every disagreement.** Where this document and a designer's instinct conflict, this document wins.

**Build context.** Every screen reads through `src/data` (`PROJECT_SETUP_BMMP.md` §3.2). No screen imports Supabase. The mock adapter must **simulate latency (150–600ms) and expose at least one seeded failure per contract method**, otherwise the loading and error states specified here are unreachable and will ship broken.

**Prohibited output (`_ANCHORS.md` §7.1, `PROJECT_SETUP_BMMP.md` §8.3).** No screen, component, tooltip, export, PDF or API response in this product displays a probability, percentage, likelihood or score of ignition, fire or thermal runaway. `hazard_ranking` is `[B2]` and when it arrives it is a **relative ranking with a stated basis per factor**. A builder who finds themselves writing a percentage next to the word "risk" has misread this document.

**Extraction confidence is not hazard.** Confidence is a property of a *text extraction from an image*. It is never placed near, combined with, or styled like a condition, damage or hazard signal, and it never appears on a screen that is about the battery's physical state.

---

## 1. Design System Reference

### 1.1 Foundation

| Layer | Choice |
|---|---|
| Component library | **shadcn/ui**, installed into `src/components/ui`. **Generated — do not hand-edit** (`PROJECT_SETUP_BMMP.md` §3.1). |
| Styling | Tailwind CSS, `prettier-plugin-tailwindcss` for class ordering |
| Variants | `class-variance-authority` (cva) in a sibling file per component, never by editing the generated primitive |
| Icons | `lucide-react` — 20px inline, 24px in touch targets |
| Forms | `react-hook-form` + `zod`, via shadcn `Form` |
| Tables | shadcn `Table` + TanStack Table for sort, filter and column state |
| Toasts | `sonner` |
| Charts | none in B1a. Meters are CSS, not a chart library. |

### 1.2 Colour — rules, not palette swatches

**Rule 1 — semantic tokens only.** App code uses `bg-background`, `text-foreground`, `bg-card`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-primary`, `bg-destructive` and their pairs. **No raw hex and no numbered Tailwind colour in a component.** Every literal colour is defined once as a CSS variable in `src/styles/globals.css`.

**Rule 2 — five status intents, defined once, used everywhere.** Statuses are named in `TAXONOMY.md`; the *intent* each maps to is defined here, once, in a single `statusIntent` map. A component never picks a colour for a status.

| Intent | Used for | Light (fg / bg / border) | Dark (fg / bg / border) |
|---|---|---|---|
| `neutral` | Informational, inactive, not-yet-started | `slate-700` / `slate-100` / `slate-300` | `slate-200` / `slate-800` / `slate-600` |
| `ok` | Clear, confirmed, within limits, complete | `emerald-800` / `emerald-50` / `emerald-300` | `emerald-200` / `emerald-950` / `emerald-700` |
| `attention` | Approaching a limit, needs a human, not yet a failure | `amber-900` / `amber-50` / `amber-400` | `amber-100` / `amber-950` / `amber-600` |
| `critical` | Past a limit, blocked, prohibited, expired | `red-800` / `red-50` / `red-400` | `red-200` / `red-950` / `red-700` |
| `pending` | Queued, in review, awaiting confirmation | `violet-800` / `violet-50` / `violet-300` | `violet-200` / `violet-950` / `violet-700` |

**Rule 3 — contrast floors, enforced, not aspirational.**
- Body text on its background: **≥ 4.5:1**.
- Any text that is the *only* carrier of a status: **≥ 7:1**.
- Interactive borders and focus rings against their background: **≥ 3:1**.
- `text-muted-foreground` is permitted **only** for metadata (timestamps, record counts, helper text). It is never used for a value, a status, a number a user acts on, or a field label in the intake flow.

**Rule 4 — colour is never the only signal.** Every status renders **icon + text label + colour**. A `Badge` with no text is not a status; it is a decoration and is not permitted. This survives glare, colour-blindness, a monochrome printout and a cracked screen.

**Rule 5 — the destructive intent is reserved.** `critical` red is used for: an overdue storage clock, a damaged-or-defective or recalled condition, a hard block, and a destructive confirmation. It is not used for a validation hint, a required-field marker or a "1 item" count badge. If red appears where nothing is wrong, red stops meaning anything.

**Rule 6 — dark mode is a first-class target, not a toggle bolted on.** Both themes ship in B1a. Warehouse screens are often dimmed; phones in a dark storage room default to dark. Every pair above is specified for both.

### 1.3 Typography

**Font:** Inter, loaded via `next/font` as a variable font, `system-ui` fallback. Monospace: `ui-monospace` stack, for IDs, serials, part numbers and date codes only.

**Numerals:** `font-variant-numeric: tabular-nums` on every table column, every meter reading, every clock, every quantity and every ID. Numbers that shift width while updating are unreadable at a glance.

| Token | Size / line-height | Weight | Used for |
|---|---|---|---|
| `display` | 30 / 36 | 600 | Page title on desktop |
| `h1` | 24 / 32 | 600 | Page title on mobile; section headers on desktop |
| `h2` | 20 / 28 | 600 | Card titles, step titles |
| `body` | **17 / 26 on mobile, 16 / 24 on desktop** | 400 | All body copy, all field values |
| `body-strong` | same as body | 600 | Field values that carry a decision; table primary column |
| `label` | 15 / 20 | 500 | Form labels, table headers |
| `caption` | 13 / 18 | 400 | Metadata only. Never a value. |
| `mono` | 15 / 22 | 500 | IDs, serials, part numbers, date codes |

**Rules.**
- **14px is the floor anywhere in the product.** Nothing renders smaller — not a badge, not a helper line, not a table footnote.
- Base font size is set on `html` and is **17px below `md`**, 16px at and above. This is the single highest-leverage legibility decision in the spec and it is not negotiable for aesthetic reasons.
- Prose measure caps at 72ch. Field values never wrap mid-token; long IDs truncate with a middle ellipsis and are always copyable in full.
- Sentence case everywhere. No ALL CAPS except a two-character unit suffix. No letter-spacing tricks.
- Every ID, serial and part number sits next to a copy button with a 44px target.

### 1.4 Spacing and layout

**Base unit 4px. Permitted values: 4, 8, 12, 16, 24, 32, 48, 64.** Nothing else. No `p-[13px]`.

| Context | Mobile | Tablet | Desktop |
|---|---|---|---|
| Page gutter | 16 | 24 | 32 |
| Card padding | 16 | 20 | 24 |
| Gap between sections | 24 | 32 | 32 |
| Gap between form fields | 16 | 16 | 20 |
| Table row height | 56 (touch) | 56 | 48 |
| Content max-width | full | full | 1280, centred, with the sidebar outside it |

**Border radius:** `rounded-lg` (8px) for cards, dialogs and sheets; `rounded-md` (6px) for inputs, buttons and badges. Two values only.

**Elevation:** flat by default. Shadow is used only for surfaces that float above the page — `Dialog`, `Sheet`, `Popover`, `DropdownMenu`, the mobile action bar. Cards use a border, not a shadow. Nested shadows are not permitted.

### 1.5 Touch, input and ergonomics

| Rule | Value |
|---|---|
| Minimum interactive target | **44 × 44 CSS px, everywhere, including desktop** |
| Primary action in the intake and shipment flows | **56px tall, full-width on mobile** |
| Mobile centre nav tab ("Log") | 64px, raised |
| Minimum gap between adjacent targets | 8px |
| Icon-only buttons | permitted only with an `aria-label` and a tooltip, and never for a primary or destructive action |
| Hover | **never the only way to reveal information or an action.** Every hover affordance has a tap/focus equivalent. |
| Drag | not used for any required interaction. No drag-to-reorder, no drag-to-assign. |
| Long-press | not used for any required interaction |
| Bottom action bar (mobile) | sticky, `env(safe-area-inset-bottom)` respected, above the tab bar during a flow |
| Focus ring | 2px `ring-ring` + 2px offset, visible on **every** interactive element, never removed |
| Keyboard | full keyboard operation on desktop; Enter advances a step, Escape closes a layer, `⌘K` opens the command palette |

### 1.6 Motion

| Transition | Duration | Easing |
|---|---|---|
| State change (hover, focus, press, badge change) | 120ms | `ease-out` |
| Enter / exit (dialog, sheet, popover, toast) | 200ms | `ease-out` in, `ease-in` out |
| Step transition in a stepper | 240ms, horizontal slide on mobile, cross-fade on desktop | `ease-in-out` |
| Skeleton → content | 120ms fade | `ease-out` |

**Rules.** `prefers-reduced-motion: reduce` removes all translation and reduces every duration to 0ms — layout must not depend on motion. No looping animation anywhere. No skeleton shimmer runs longer than 400ms without being replaced by a text status ("Reading label — about 5 seconds"). Nothing in this product is decorative enough to justify moving.

### 1.7 shadcn component inventory

Install these and only these in B1a. A component not on this list requires a decision-log entry.

| Component | Where it is used |
|---|---|
| `Alert`, `AlertTitle`, `AlertDescription` | Hard blocks, storage-clock warnings, read-only notice, offline notice, classification outcome |
| `AlertDialog` | Destructive or irreversible confirmation only — reject a whole extraction, revoke a member, correct a clock start date |
| `Badge` | Every status, every confidence band, every count. Always with text. |
| `Breadcrumb` | Every detail and stepper route |
| `Button` | All actions. Variants: `default` (primary), `secondary`, `outline`, `ghost`, `destructive`, `link` |
| `Card` | Dashboard alert cards, record sections, container cards, catalog cards |
| `Checkbox` | Multi-select in tables, per-field confirm in the extraction review |
| `Command` | Global command palette, catalog search, container picker |
| `Dialog` | Short single-purpose edits |
| `DropdownMenu` | Row actions, user menu, organization switcher |
| `Form`, `FormField`, `FormMessage` | Every form |
| `Input`, `Textarea`, `Label` | Every field |
| `Pagination` | Every list over one page |
| `Popover` | Alert bell, field-source explanations, filter builders |
| `Progress` | Container fill meter, storage clock meter, extraction progress |
| `RadioGroup` | Transport mode (this is where the air block lives), single-choice settings |
| `ScrollArea` | Long contents lists, review queue |
| `Select` | Bounded pick-one fields |
| `Separator` | Section division inside cards |
| `Sheet` | Mobile "More" nav, mobile filters, mobile record preview |
| `Skeleton` | Every list and detail loading state |
| `Sonner` (Toaster) | Success and transient failure feedback |
| `Switch` | Boolean settings only. Never for a state that has consequences. |
| `Table` | Every list |
| `Tabs` | Detail-route secondary navigation |
| `Tooltip` | Explanations on icon buttons and disabled controls. Never the only source of load-bearing information. |

---

## 2. Component Specs

Every component below specifies: **default, hover, focus, active, disabled, loading, error, empty.** A component that cannot be in a state marks it `n/a` with a reason. A builder shipping a component without its disabled and error states has not shipped the component.

---

### 2.1 `ExtractionReviewCard` — the confidence-gated extraction review

**This is the highest-value component in the product.** It is where a human takes responsibility for what the machine read, and it is the thing that makes every downstream document defensible. Everything else on this list can be ordinary; this cannot.

**Used on:** `/batteries/new?step=2` and `/review` **§3.8a**. **Identical component, identical behaviour, both places.** The review queue is not a second implementation. **Rendered for P1 and P6 only** — they are the only roles that may confirm an identification (Rule 2.22). P2's view of the same queue (§3.8b) does not render this component at all.

**Reads:** `label_extraction` (per-field values + per-field confidence), `catalog_entry` candidates, `intake_photo` and its label crop, `date_code_decode`.
**Rules:** BR §2 (intake and identification), especially Rules 2.7–2.23; `_ANCHORS.md` §6 (the gate).

#### 2.1.1 Anatomy

```
┌────────────────────────────────────────────────────────────────┐
│  [ label crop, tap to enlarge ]     Read 2026-08-11 14:22      │  ← header
│  ⚠ Needs review — 2 fields below the confidence threshold      │  ← gate banner
├────────────────────────────────────────────────────────────────┤
│  FIELD ROWS  (one per extracted field — see 2.1.2)             │
├────────────────────────────────────────────────────────────────┤
│  CATALOG MATCH PANEL  (see 2.13)                               │
├────────────────────────────────────────────────────────────────┤
│  ✗ Reject this read        [ Confirm and continue  → ]         │  ← action bar
│  3 items outstanding before you can continue                   │
└────────────────────────────────────────────────────────────────┘
```

On mobile the header collapses to a 72px label-crop thumbnail; the action bar is sticky at the bottom of the viewport.

#### 2.1.2 The field row — the atomic unit

Each row shows four things, always, in this order: **field name · value · where the value came from · confidence.** Then the confirm control.

| Element | Spec |
|---|---|
| Field name | `label` token, `text-foreground` — **never** `text-muted-foreground` |
| Value | `body-strong`. Mono for IDs, part numbers, serials and date codes. An illegible field renders as the literal text **"Not read"**, `attention` intent — never a blank cell, never a dash, and **never a guess, an interpolation from a similar product, or a fill from an unmatched catalog entry** (Rule 2.11). A value that fails shape validation is presented as not-read with the raw text shown beneath for the reviewer to judge (Rule 2.12). |
| Source | A `Badge` with `neutral` intent and one of exactly five texts: **Read from label · Matched from catalog · Decoded · Detected from image · Entered by you** |
| Confidence | A `Badge` with the band as text — **High / Medium / Low / None** — intent `ok` / `attention` / `critical` / `neutral`. The numeric value appears as `caption` beneath on desktop and in the badge tooltip on mobile. Bands and threshold per RN-2. |
| Confirm control | See 2.1.4 |

#### 2.1.3 The fields, their sources, and what is gated

| Field | Source | Gated | Notes |
|---|---|---|---|
| Manufacturer | Read from label | | |
| **Model / part number** | Read from label | **HARD GATE** | |
| **Chemistry** | **Matched from catalog**, or **Entered by you** | **HARD GATE** | **Never "read from the image", never "detected".** Chemistry comes from exactly two sources: a matched catalog entry, or direct human entry — never from an extraction alone and never from form-factor detection (Rules 2.9, 2.10). Copy that implies a camera identified chemistry is a defect, not a wording preference (`_ANCHORS.md` §7.2). |
| Nominal voltage | Read from label, or matched from catalog | | |
| Capacity / energy (Ah / Wh) | Read from label, or matched from catalog | | Unit rendered explicitly, never inferred |
| Form factor | **Detected from image** | | The one visual inference this product makes, and it is offered as a proposal that still passes the gate like any other field. **Form-factor detection never implies, suggests or contributes to a chemistry determination** (Rule 2.25). Values in `TAXONOMY.md`. |
| Serial number | Read from label | | Mono, copy button |
| Date code → manufacture date | Read from label, then **Decoded** | | Decode is deterministic and rules-based via `date_code_decode`, not a model. The row shows the raw code *and* the decoded date. A decode failure renders as **undecodable**, never as an approximate date, and a decoded date never overrides one a human entered (Rule 2.24). |
| Certification marks | Read from label | | Multi-value |
| UN 38.3 marking present | Read from label | | Tri-state: present / not present / could not tell. **"Could not tell" is a real value and must be selectable.** |
| **Assessed condition** | **Entered by you** | **HARD GATE** | Values in `TAXONOMY.md`. Confirming an indicator from the damaged-or-defective set triggers §2.6 and Flow D. Called **assessed**, never *measured* — no value is labelled or exported as measured unless it came from an integrated third-party tester, and the two are never merged into one field (Rules 2.27, 11.5; `_ANCHORS.md` §7.5). |
| State of charge at intake | Entered by you | | Recorded as assessed condition **with its observation method noted** (Rule 2.26). Not a confidence field; no confidence badge is rendered on it. |
| Source reference (device / vehicle / asset) | Entered by you | | Optional. B1a **captures** it; verification and the formal provenance binding are `[B2]` §10 (Rule 2.30). The UI must not imply it has been verified. |

#### 2.1.4 What a human confirming looks like

This is the interaction the entire product rests on. Specify it exactly.

1. **Resting.** The row shows value, source and confidence. A single **Confirm** button sits at the row's right (desktop) or full-width beneath the value (mobile), 44px minimum, 48px on mobile.
2. **Correcting.** Tapping the value turns the row into an editable `Input` (or `Select` for bounded fields) with the extracted value pre-filled and fully selected. The button relabels to **Confirm corrected value**. The original extracted value stays visible beneath as `caption`: *"Read as: NCR18650B"*. **The original is never overwritten in the record** — the extracted/corrected pair is the training asset (D-7).
3. **Confirmed.** The row collapses to a single line: check icon, the confirmed value, the confirming user's name, the timestamp, and a **Change** link. Intent `ok`. Confirmation is reversible up until commit; after commit, a change is a new edit on `/batteries/[id]` writing its own `audit_event`.
4. **Bulk confirm.** A **Confirm all high-confidence fields** action appears above the rows when three or more fields sit in the High band. It **excludes the three hard-gated fields, always.** Those three are confirmed one at a time, deliberately, by a person, at every confidence level. There is no configuration, role, setting, import path or shortcut that changes this, for anyone including P6 (Rules 2.15, 2.17; `_ANCHORS.md` §6). **Only P1 and P6 may confirm an identification at all** (Rule 2.22). In a bulk intake, every record gates individually — fifty records produce fifty gate decisions, not one (Rule 2.33).
5. **Gate banner.** When any single field is below threshold, **the whole record** is in review, not just that field (Rule 2.14). A `pending`-intent `Alert` sits above the rows: *"Needs review — N fields below the confidence threshold. Nothing is saved until you confirm."* It offers **Resolve now** (scrolls to the first flagged row) and **Save to review queue** (exits and files the `intake_session` on `/review`). See RN-1.
6. **Commit gate.** The primary action is disabled until: all three hard-gated fields are confirmed; every Low-band field is either corrected-and-confirmed or explicitly rejected; every required field holds a value. **A disabled primary action always renders its reason** as a checklist directly beneath it — *"Confirm chemistry · Confirm assessed condition · Resolve 1 low-confidence field"* — with each item scrolling to its row. A bare disabled button with no explanation is a defect.

#### 2.1.5 What rejecting looks like

**Per-field reject** — a `ghost` "Reject" beside Confirm.
- Clears the value, marks the field rejected with `critical` intent, and requires either a manual entry or an explicit "leave empty" for optional fields.
- The rejected extracted value is retained on the `label_extraction`, never deleted. A rejected read is the most valuable training signal in the set.
- Rejecting the catalog-matched chemistry also clears the catalog match and reopens the match panel.

**Whole-read reject** — "Reject this read" in the action bar, `destructive outline`.
- Opens an `AlertDialog`: *"Discard everything read from this label? Your photos are kept. You'll re-take the photo or enter the details by hand."* Confirm / Cancel.
- On confirm: the `label_extraction` is marked rejected and **retained**; `intake_photo` rows are kept; the flow returns to step 1 with a choice of **Re-take photo** or **Enter details manually**; `audit_event` records the rejection with the actor.
- On `/review`, a whole-read reject returns the item to the queue in a manual-entry state — it does not disappear and it does not silently resolve.

**Voiding an item** — the only other way out of the queue. A queue item leaves in exactly two ways: a human confirms it, or a human **voids it with a stated reason** (Rule 2.23). It never times out into a confirmed state and never ages out. **Void** is an `AlertDialog` with a required typed reason; the voided session, its photos and its extraction are all retained (Rule 2.1). There is no "dismiss", no "ignore" and no auto-expiry control on this component, for any role.

**An extraction is a proposal, never a fact** (Rule 2.8). Until a human confirms it, no value in this component is displayed as confirmed, stored as fact, or used by any downstream rule — no classification, no document, no shipping identifier.

#### 2.1.6 States

| State | Appearance and behaviour |
|---|---|
| **Default** | All rows resting. Primary action disabled with its reason checklist. |
| **Hover** (row) | `bg-muted/50`, 120ms. Desktop only, and reveals nothing that is not already visible. |
| **Focus** | 2px ring on the focused control; the whole row gets a 2px left bar so the focused row is identifiable at a glance on a large screen. |
| **Active** (pressing Confirm) | Button scales to 98%, 120ms, no colour change. |
| **Disabled** (offline, or an expired P6 support grant) | Every confirm, edit and reject control disabled, `opacity-60`, with a single `Alert` at the top of the card stating why — *"You're offline — confirmations can't be saved until you reconnect"* (RN-3), or *"Your support grant expired"* (Rule 1.28). Values stay fully readable. **This is not the read-only-role state:** the only roles that render this component are P1 and P6 (Rule 2.22), and P2 gets a different composition that does not include the card at all (§3.8b). Do not add a read-only mode to this component — there is no role that needs one. |
| **Loading** (extraction running) | The card renders its shell with `Skeleton` rows and a text status with an estimate: *"Reading label — about 5 seconds"*. A **Cancel** is always available. Beyond 20 seconds, the copy changes to *"Still reading — you can wait or enter the details by hand"* and manual entry becomes available in place. |
| **Error** (extraction failed) | `critical` `Alert` in place of the field rows, stating what failed in plain language, with **Try again** and **Enter details manually**. Photos are preserved. The session is never lost. |
| **Empty** (zero fields extracted) | The **no-read state**, distinct from low confidence. See §5, E-4. |

#### 2.1.7 Accessibility

Each row is a `fieldset` with a `legend`; confidence and source are inside the accessible name so a screen reader hears *"Chemistry, matched from catalog, confidence low, not yet confirmed."* Confirming announces via a polite live region. The gate banner is `role="status"`. The hard block in §2.6 is `role="alert"`.

---

### 2.2 `PhotoCaptureStep`

**Used on:** `/batteries/new?step=1`. Mobile-first — this is the component P1 and P4 hold in one hand.

**Anatomy.** Full-bleed camera view; a rectangular framing guide with the copy *"Fill the frame with the label"*; a 72px shutter centred in the bottom bar; a thumbnail strip of captures; a **Use photo library** secondary; a capture-type selector — **Label (required) · Whole pack · Damage**.

| State | Behaviour |
|---|---|
| Default | Live camera, rear-facing, autofocus, torch toggle top-right (44px). Shutter enabled once a frame is available. |
| Hover | n/a — touch surface |
| Focus | Shutter and torch take a visible ring under keyboard focus on desktop |
| Active | Shutter flashes the frame white for 80ms; a 50ms haptic where supported |
| Disabled | Camera permission denied → the camera view is replaced by an explanatory panel with **Open settings** guidance and **Upload a photo instead**. Never a black rectangle. |
| Loading | Uploading: the thumbnail carries a determinate `Progress` ring. The user may keep shooting during upload. |
| Error | Upload failed → the thumbnail takes a `critical` border and a **Retry** overlay; a toast states *"Photo not sent — kept on this device"*. See §5, E-3. |
| Empty | No captures yet → the framing guide plus one line: *"Photograph the label. You can add the whole pack and any damage next."* |

**Desktop.** Becomes a drop zone with a file picker and the same capture-type selector. If a webcam is present, a **Use camera** secondary is offered but is never the default — nobody photographs a pallet with a laptop.

**Guidance that fires automatically:** if the captured frame is under a legibility floor (too small, too dark, too blurred), show an `attention` `Alert` *before* running the read: *"This may be hard to read — glare on the left. Re-take?"* with **Re-take** and **Use anyway**. Never silently reject the user's photo.

---

### 2.3 `StatusBadge`

Wraps shadcn `Badge`. **Renders icon + text + intent colour. Always all three.**

Props: `value` (a status from `TAXONOMY.md`), `size` (`sm` 24px / `md` 28px). The value→intent mapping is the single `statusIntent` map from §1.2 Rule 2. A component never chooses a colour.

| State | Behaviour |
|---|---|
| Default | Icon + text, `rounded-md`, 8px horizontal padding, 13px text minimum |
| Hover / Active | none — a badge is not interactive |
| Focus | n/a unless wrapped in a link, in which case the wrapper takes the ring |
| Disabled | n/a |
| Loading | Parent renders `Skeleton` at the badge's exact dimensions — never a jumping layout |
| Error | An unknown status value renders `neutral` with the raw value in mono and logs a console warning. **It never renders blank** — a missing status is more dangerous than an ugly one. |
| Empty | No status → the literal text "Not set", `neutral` |

---

### 2.4 `StorageClockMeter`

**Used on:** `/`, `/containers`, `/containers/[id]`, `/batteries/[id]`. Wraps `Progress`.
**Rules:** BR §4. The accumulation period and the alert ladder are data (Rules 4.5, 4.13); tier names are `TAXONOMY.md`.

**Anatomy.** A horizontal bar; above it, the elapsed and remaining durations in `body-strong` with tabular numerals; below it, the accumulation start date and the tier as a `StatusBadge`. Both figures always render as text — the bar alone is never the information.

| State | Behaviour |
|---|---|
| Default (within limits) | `ok` fill, remaining time in plain language: *"312 days remaining"* |
| Approaching (the configured alert ladder) | `attention` fill, tier badge, and a caption naming the tier. The ladder is configuration data; **the accumulation period is jurisdiction data and is never assumed to be one year** (Rules 4.5, 4.13) |
| **Overdue** | `critical` fill at 100%, badge, and the overrun stated: *"14 days past the limit"*. Overdue is **a hard state, not a warning** (Rule 4.15): the container accepts no new items (Rule 4.16), and the meter states the only two ways out — ship the contents, or record a remediation. **Non-dismissible by every role, including P6.** |
| **Never paused** | There is no hold, freeze, suspend, extend or snooze control on this component, for any role. A container in dispute, under inspection or awaiting a carrier keeps counting (Rule 4.6). There is likewise **no re-date control** — start dates travel with the records and cannot be restarted by moving, consolidating or splitting (Rules 4.9–4.12). |
| **Time zone** | Every date, alert evaluation and overdue determination renders in the **site's** local time zone, and the zone is shown next to any absolute timestamp. A container is not overdue because a server is in a different zone (Rule 4.29). |
| Hover / Focus | On the container row, the whole row is the target; the meter itself is not separately interactive |
| Disabled | n/a |
| Loading | `Skeleton` at the meter's exact height |
| Error (clock data unavailable) | Bar replaced by an `attention` `Alert`: *"Storage clock unavailable"* with **Retry**. **Never render an empty bar** — an empty bar reads as "nothing to worry about", which is the most dangerous possible misread in this product. |
| Empty (no contents, no clock started) | Bar replaced by *"No clock running — this container is empty"*, `neutral` |

---

### 2.5 `ContainerFillMeter`

**Used on:** `/containers`, `/containers/[id]`, `/` alert cards.
**Rules:** Rules 4.25, 4.26; the quantity monitor itself is `[B1b]` BR §9.

Shows fill against the container's configured capacity, updated on every placement and removal (Rule 4.25), and — where the site's jurisdiction and fire-code profile supplies one — against the applicable quantity limit.

**Non-negotiable:** the threshold value **and its unit** are read from the rule. The component renders whatever number and unit the rule supplies and assumes nothing about either. **No unit and no number is a literal in this component** (`_ANCHORS.md` §7.4, `PROJECT_SETUP_BMMP.md` §8.1). A hard-coded threshold is a review rejection.

| State | Behaviour |
|---|---|
| Default | `ok` fill; text reads `<current> of <capacity> <unit>` with tabular numerals |
| Approaching threshold | `attention` fill, a threshold tick mark on the bar, and the threshold labelled with its unit |
| **Over the limit** | `attention` fill and a warning to P2 stating the reading, the limit, and **the limit's source** (*"per your site's jurisdiction and fire-code profile"*), with a link to `/settings/organization` for roles that can reach it. **In B1a this warns and blocks nothing** — the monitoring, alerting and evidence behaviour is `[B1b]` §9 and **B1a must not implement it ahead of specification** (Rule 4.26). |
| Loading / Error / Empty | As `StorageClockMeter` |
| No limit configured | Fill against capacity only, plus a `neutral` caption: *"No quantity limit set for this jurisdiction."* **Never invent one, never fall back to a default number, never assume a unit.** |

---

### 2.6 `HardBlockNotice`

**Used on:** `/shipments/new` (air transport), `/batteries/[id]` and `/containers/[id]` (damaged/defective), and any future prohibited action.
**Rules:** `BR §6`.

A `destructive`-variant `Alert`, `role="alert"`. Rule 6.9 specifies exactly what it must contain, and all five parts are required: a plain-language statement of the prohibition; **the citation carried by the governing rule version** (data, never typed into the component — Rule 1.23); the list of specific records causing the block; **for each record, the specific indicator that triggered it**; and the way forward.

Rule 6.10 specifies the way forward as **exactly three paths and no others**, rendered as actions rather than advice:

> **Air transport is not available for this shipment.**
> Damaged, defective and recalled lithium batteries are prohibited from air transport.
> *<citation, from the rule version in force>*
>
> **BR-2026-0812-0031** — swelling →
> **BR-2026-0809-0014** — recall association →
>
> **Ship by ground** · **Remove these records and ship the rest by air** · **Re-assess the damage on a record**

| State | Behaviour |
|---|---|
| Default | Rendered above the affected control; the control itself is `disabled` and **visibly present**, never hidden |
| Hover / Focus (on the blocked control) | Tooltip repeats the one-line reason. The tooltip is a repetition — **never the only place the reason appears** |
| Active | n/a — the control cannot be activated |
| Disabled | This component *is* the disabled explanation |
| Loading | The blocked control stays disabled while the constraint is being evaluated. **Fail closed:** if the check has not returned, the option is unavailable, not available. |
| Error (constraint could not be evaluated) | The control stays disabled and the notice reads *"We couldn't confirm this shipment's constraints. Air transport is unavailable until we can."* with **Retry**. **An unverified constraint never unlocks an option.** |
| Empty | Component absent when nothing is blocked |

**No override exists.** No admin bypass, no "proceed anyway", no acknowledge-and-proceed, no "I understand the risk" checkbox, no supervisor approval path, no setting, no support grant, no import path, no API call. **P6 sees exactly what P1 sees** (Rules 6.7, 6.8, 1.20). The server re-evaluates at commit and rejects with the same stated reason. A builder who adds an override has introduced a compliance defect, not a feature.

**The only way the block clears** is a new `damage_assessment`, entered by a human, finding no damaged-or-defective indicator present, carrying a **stated reason** and **at least one supporting photograph** (Rule 6.11). The re-assess path opens that form; it never opens a bypass. The superseded assessment is then displayed permanently alongside the current one — author, timestamp, indicators, evidence — on the record and in every export (Rule 6.12). Design that pairing to be easy to find, not tucked into a history tab: a reversed damage finding is the first thing an auditor will look for.

**A recall association blocks identically to physical damage** (Rule 6.5), and the notice must name it as a recall rather than describing it as damage.

---

### 2.7 `RecordTable`

The shared list component behind `/batteries`, `/containers`, `/shipments`, `/catalog`, `/review` and `/audit`. shadcn `Table` + TanStack.

**Anatomy.** Header with a search `Input` (debounced 250ms), a filter row, an optional export, and the route's primary action. Body rows at 48px desktop / 56px touch. Footer with `Pagination` and a result count.

| State | Behaviour |
|---|---|
| Default | Sortable columns with a persistent sort indicator; the first column is `body-strong` and is the link target; the whole row is the click target where the role can open the detail |
| Hover | `bg-muted/50` + `cursor-pointer`, **only** when the row is navigable for this role (`SITE_ARCHITECTURE.md` §5.4) |
| Focus | Row-level ring; Enter opens; arrow keys move between rows |
| Active | 80ms `bg-muted` press state |
| Disabled (row not navigable for this role) | No hover, no pointer cursor, no ring, and a tooltip / tap-to-reveal line naming the roles that can open it |
| Loading | 8 `Skeleton` rows at the exact row height. **Never a spinner in the middle of an empty page** — the layout must not jump. |
| Error | Rows replaced by a `critical` `Alert` with the plain-language failure and **Retry**. Header, filters and count stay rendered so the user keeps their context. |
| Empty — no records at all | The route's empty state (§5) |
| Empty — filters exclude everything | Distinct from the above: *"No batteries match these filters"* + **Clear filters**. **Never show the zero-records onboarding copy to someone who just typed a bad filter.** |

**Filter, sort and page state lives in the URL** (`SITE_ARCHITECTURE.md` §7.4). On mobile the filter row collapses into a **Filters** button opening a `Sheet` with a count badge.

---

### 2.8 `DocumentViewer`

**Used on:** `/documents/[id]`, and embedded as a preview on `/shipments/[id]` and `/containers/[id]`.

**Anatomy.** A paged document canvas on a `bg-muted` backdrop; a toolbar with **Print**, **Download PDF**, page navigation and zoom; a metadata strip — document type, generated-at, generated-by, the record it belongs to, and the render instance ID in mono.

| State | Behaviour |
|---|---|
| Default | First page fit-to-width on mobile, fit-to-page on desktop |
| Hover / Focus / Active | Standard button states on the toolbar; the canvas is not interactive beyond zoom and scroll |
| Disabled | **Print and Download are never disabled for any role that can reach the route, including P5.** Reading and printing evidence is the auditor's entire job. |
| Loading | `Skeleton` at the page's aspect ratio + *"Preparing document"* |
| Error | `critical` `Alert`: *"This document couldn't be generated"* with the reason, **Retry**, and a link to the source record. A failed render never blocks reading the underlying record. |
| Empty | n/a — the route requires a `document_render` |

**Printing is a real browser print** against a dedicated print stylesheet: Letter by default, no app chrome, no navigation, no dark mode, black on white, hairline rules. Every print writes an `audit_event` (BR §12) — a reprint is a new render superseding the old, and both stay in the trail (Rules 4.20, 5.15).

---

### 2.9 `ReadOnlyBanner` and role-gated controls

**Used on:** every route P5 can reach that contains mutating controls. **Not** used for P2 on `/review` — see below.

A `neutral` `Alert` pinned below the page title: *"Read-only access. You can view and export everything on this page; you can't change it."*

**Rules for gated controls.**
- **Mutating controls render, disabled**, with a tooltip / tap-to-reveal reason. The auditor is assessing the system's controls; controls they cannot see cannot be assessed.
- **Destructive controls are omitted entirely.** There is no value in showing an auditor a disabled Delete.
- Server-side rejection is the actual enforcement. The disabled attribute is a courtesy (`SITE_ARCHITECTURE.md` §5.3).
- Routes P5 cannot reach never render at all — they redirect (`SITE_ARCHITECTURE.md` §5.3).

Same pattern, different copy, for any role hitting a control outside its set — for example P2 on `/containers/[id]` seeing **Mark ready to ship** where P1 sees **Ship this container** (`SITE_ARCHITECTURE.md` §5.5).

**Do not use this component for P2 on `/review`.** That screen is a different composition, not a gated one — §3.8b and E-8b. The decision rule, which applies to every role/screen pair this product ever adds:

| The role's job on this screen is… | Treatment |
|---|---|
| **Evaluating the system itself** (P5, auditor / underwriter) | `ReadOnlyBanner` + mutating controls **rendered disabled** with a stated reason. Controls she cannot see, she cannot assess. |
| **Something else entirely** (P2 on `/review`) | **A view composed for her question**, with the other role's controls **absent**. No banner announcing a restriction. |

A disabled control tells a colleague she is missing a permission; an absent one tells her this is not her job. Both are honest, and which one is correct depends entirely on why the person is on the screen.

---

### 2.10 `OfflineBanner` and the capture queue

**Used on:** the `(app)` layout — every authenticated route. See RN-3.

**Anatomy.** A sticky `attention` bar below the top bar: *"You're offline. Showing information from 14:22. Photos will send when you reconnect."* Plus a queue chip with the pending capture count, tappable to a `Sheet` listing each queued item with its status.

| State | Behaviour |
|---|---|
| Online | Absent |
| Offline | Banner present. Reads serve from cache with the staleness time stated **as a timestamp, not as "recently"**. |
| Offline — capture | Photos capture normally and queue locally. Each queued thumbnail shows **Queued**. |
| Offline — extraction | **Not run.** Step 2 shows *"We'll read this label when you're back online"* with the option to enter details manually now. |
| Offline — commit | **Blocked for any hard-gated confirmation** (RN-3). The primary action is disabled with that reason stated. |
| Reconnecting | Banner turns `neutral`: *"Back online — sending 3 photos"* with a determinate `Progress` |
| Sync error | `critical`: *"2 photos couldn't be sent"* with **Retry** and per-item detail. Nothing is discarded without the user saying so. |
| Slow (not offline) | Any request over 3s raises a `neutral` inline notice: *"This is taking longer than usual"*. Every long operation keeps a **Cancel**. |

**Rule: no silent failure, ever.** Every queued, failed or deferred item is individually visible and individually retryable. A warehouse user who cannot tell whether their work saved will stop trusting the product within a shift.

---

### 2.11 `AlertCard`

**Used on:** `/`. One card per **`alert` record**, ordered most urgent first: overdue containers → the configured alert-ladder tiers → over-limit quantity → open review items.

**An alert is a stored record, not view state computed on render.** Every card here, every entry behind the alert bell, and the `/containers?filter=alerting` deep link read the same `alert` rows. That is what gives an alert a raised-at time, a target role — P2 always, P1 for containers at their site (Rule 4.14) — an addressable identity for a deep link, and an audit trail when it is raised, re-tiered or resolved. **No screen derives an alert on render**, or two screens will disagree about what is alerting.

**Anatomy.** Intent-coloured left bar (4px) + icon; a title stating the fact (*"Container C-14 storage clock expired"*); a subtitle with the specifics (*"14 days past the limit · 22 records"*); one primary action button routed per §3.4 of `SITE_ARCHITECTURE.md`.

| State | Behaviour |
|---|---|
| Default | Full card, action visible, whole card is the click target on mobile |
| Hover / Focus / Active | Standard card interactive states |
| Disabled | If the role cannot take the action, the card renders informationally and names who can: *"Ask a Handler or Admin to build the shipment."* No dead button. |
| Loading | `Skeleton` cards, three |
| Error | Single `critical` `Alert` replacing the region, with **Retry** |
| Empty | *"Nothing needs your attention right now."* with a `ok` icon. Distinct per role (§5, E-1). |

**Overdue-clock cards are pinned and cannot be dismissed by any role, including P6** (Rules 4.15, 4.16; E-6).

---

### 2.12 `StepperNav`

**Used on:** `/batteries/new`, `/shipments/new`.

**Desktop:** horizontal, three numbered steps with titles, completed steps checked and clickable, future steps disabled.
**Mobile:** a compact bar — *"Step 2 of 3 · Extraction review"* — plus a 3-segment progress bar. Titles do not fit and are not forced in.

| State | Behaviour |
|---|---|
| Default | Current step emphasised; step index in the URL (`?step=`) |
| Hover / Focus | Completed steps only |
| Active | 240ms slide (mobile) / cross-fade (desktop); 0ms under `prefers-reduced-motion` |
| Disabled | Future steps are not reachable until the current step's gate passes; the disabled step's tooltip names the gate |
| Loading | Current step body shows its own loading state; the stepper itself does not animate |
| Error | The failing step takes a `critical` marker; the stepper does not advance |
| Empty | n/a |

Leaving mid-flow persists the draft. Returning resumes at the step reached, with a `neutral` `Alert`: *"Picking up where you left off — started 14:22."*

---

### 2.13 `CatalogMatchPanel`

**Used inside:** `ExtractionReviewCard`. **Rules:** Rules 2.18, 2.19, 2.20.

Shows up to five `catalog_entry` candidates, each with: manufacturer and model, chemistry, key specs, and **the match basis** — which extracted fields matched, stated explicitly (*"Matched on manufacturer + part number"*). A `RadioGroup` selects one; **Search the catalog** opens a `Command` scoped to `catalog_entry`.

| State | Behaviour |
|---|---|
| Default | Top candidate pre-highlighted but **not pre-selected**. Nothing is chosen until a person chooses it. |
| Hover / Focus / Active | Standard `RadioGroup` item states, 56px rows |
| Disabled | Read-only roles: candidates readable, selection disabled |
| Loading | Three `Skeleton` rows + *"Matching against the catalog"* |
| Error | `attention` `Alert` + **Retry** + **Continue without a catalog match** |
| **Empty — no match** | The catalog-miss state: *"No catalog match found."* Three actions, all equally available: **Search the catalog** · **Enter details manually** · **Propose a new catalog entry**. See §5, E-5. |

**Selecting a candidate populates chemistry and any specification the label did not carry, each tagged `Matched from catalog` and each still requiring confirmation.** A catalog match is a suggestion, never an answer.

---

### 2.14 `CommandPalette`

`⌘K` / `Ctrl K` on desktop; a top-bar search icon on mobile. Scopes: battery records (ID, serial, model), containers (label ID), shipments (number), catalog entries, and page navigation.

| State | Behaviour |
|---|---|
| Default | Recent items and the role's most-used pages |
| Hover / Focus / Active | Arrow keys move, Enter opens, Escape closes |
| Disabled | n/a |
| Loading | Inline spinner in the input's trailing slot; previous results stay visible until replaced |
| Error | Inline row: *"Search unavailable"* + **Retry** |
| Empty | *"No matches for '<query>'"* + a scoped suggestion (*"Try a part number or a container label"*) |

**Results are role-filtered.** A role that cannot reach `/containers/[id]` gets no container results — the palette never surfaces a destination the guard will refuse.

---

### 2.15 `MobileActionBar`

Sticky bottom bar during `/batteries/new` and `/shipments/new` on `<md`. Contains the step's primary action at 56px full-width, an optional secondary above it, and — when the primary is disabled — the reason checklist from §2.1.4 rendered directly above it. Respects `env(safe-area-inset-bottom)`. Sits above the tab bar and hides the tab bar during a flow, so nothing competes with the step's action.

---

## 3. Screen Specs

One per route in `_ANCHORS.md` §5. Access per `SITE_ARCHITECTURE.md` §5.2.

---

### 3.1 `/sign-in` — Sign in

| | |
|---|---|
| **Purpose** | Authenticate an existing user into an organization. |
| **Who uses it** | Everyone. Public. |
| **Primary action** | **Sign in** |
| **On success** | Redirect to `?next=` if present, otherwise `/`. If no current `tos_acceptance`, route to acceptance first. |
| **On failure** | A single non-specific message — *"That email or password didn't work"* — never disclosing which was wrong. Rate-limited with a stated wait. |

**What's on it.** Centred `Card`, max-width 400px, no app chrome. Product name. Email and password `Input`s. **Sign in** at 48px full-width. "Forgot password". "Don't have an account? Sign up". If arriving from `/invite/[token]`, a `neutral` `Alert` naming the inviting organization above the form.

**shadcn:** Card, Form, Input, Label, Button, Alert.

---

### 3.2 `/sign-up` — Sign up

| | |
|---|---|
| **Purpose** | Create an account and capture Terms of Service acceptance, including the data training-rights grant. |
| **Who uses it** | Everyone. Public. |
| **Primary action** | **Create account** |
| **On success** | `tos_acceptance` written, `membership` created if a token was carried, redirect to `/`. |
| **On failure** | Field-level validation inline. Existing email → *"An account already exists for this email"* + a link to `/sign-in`. |

**What's on it.** Name, email, password with a visible requirements list (not a strength meter). **A required `Checkbox` accepting the Terms of Service, with the data training-rights grant stated in the visible label — not buried behind a link alone.** The founding member created here is the organization's first **binding-authority** member and is the one who can accept (Rules 1.8, 7.3). The acceptance records the exact version, the accepting user, the timestamp with time zone and the organization, permanently and never editably (Rule 7.5).

**Why this cannot be deferred.** Training eligibility is stamped at the instant of capture and is immutable — a record captured with no acceptance in force is **permanently** ineligible, and no later acceptance, re-acceptance, backdating or administrative action ever reverses it (Rules 7.6, 7.7). Ineligible is not useless: the record still works for compliance, documentation, storage, shipment, audit and insurance evidence (Rule 7.8). Eligibility governs one thing only — whether it may enter a training set.

**shadcn:** Card, Form, Input, Checkbox, Button, Alert.

---

### 3.3 `/invite/[token]` — Accept invitation

| | |
|---|---|
| **Purpose** | Turn an invitation token into a `membership` with a named role. |
| **Who uses it** | Any invited persona. Public. |
| **Primary action** | **Accept invitation** |
| **On success** | Route to `/sign-up` (new user) or `/sign-in` (existing), carrying the token; then `membership` created and redirect to `/`. |
| **On failure** | Expired, used or revoked → a stated reason and **Request a new invitation**. Never a raw error page. |

**What's on it.** Inviting organization name, the role being granted in plain language (*"You'll join as a Compliance Handler"*), who invited them. **No tenant data before authentication.**

**shadcn:** Card, Button, Alert, Badge.

---

### 3.4 `/` — Dashboard

| | |
|---|---|
| **Purpose** | Show this role the work that needs doing today, ordered by urgency. |
| **Who uses it** | P1 P2 P3 P4 P5 P6 — content differs by role. |
| **Primary action** | P1/P6: **Log a battery**. P2: the most urgent storage-clock alert. P5: **Open the audit log**. |
| **On success** | Every alert card routes to the screen where it is resolved. |
| **On failure** | Per-region errors — a failed alerts fetch never blanks the whole page. |

**What's on it.**
- **Alerts region** (`AlertCard` §2.11), most urgent first: overdue containers → the configured alert-ladder tiers → over-limit quantity → open review items. Overdue cards pinned, non-dismissible for every role. Storage-clock alerts go to **P2 always, and to P1 for containers at their site** (Rule 4.14).
- **Review queue card** — routes to `/review`. **P1 and P6** see it as work: *"7 readings need confirming."* **P2** sees the same count framed as her problem: *"7 batteries in your containers aren't identified yet"* — and it lands her on §3.8b, not on P1's queue (`SITE_ARCHITECTURE.md` CL-1). P3, P4 and P5 do not see the card at all.
- **Storage summary** — container count by clock tier, `StorageClockMeter` per attention-or-worse container.
- **Recent activity** — last ten `audit_event`s the role may see, each linked.
- **Quick actions** — role-filtered: Log a battery, Build a shipment, Print a container label.
- **No hazard, risk or fire-probability surface. None. In any phase.** (`_ANCHORS.md` §7.1.)

**shadcn:** Card, Alert, Badge, Progress, Button, Skeleton, Separator.

---

### 3.5 `/batteries` — Batteries

| | |
|---|---|
| **Purpose** | Find any battery record by search, filter or sort. |
| **Who uses it** | All six. Read for P2–P5; P1/P6 also create. |
| **Primary action** | **Log a battery** (P1/P6) · **Export** (P2/P5/P6) |
| **On success** | Row opens `/batteries/[id]`. |
| **On failure** | `RecordTable` error state; filters and count preserved. |

**What's on it.** `RecordTable` (§2.7). Columns: Record ID (mono, primary) · Manufacturer + model · Chemistry · Form factor · Assessed condition (`StatusBadge`) · Container · Storage clock tier · Logged (relative + absolute on hover). Filters: condition, chemistry, container, clock tier, catalog-matched yes/no, date range. Search across ID, serial and model.

**A small mobility-device pack and a vehicle traction pack render in the same table with no special case** (`PROJECT_SETUP_BMMP.md` §8.2). The mock fixtures must contain both from day one, sitting next to each other.

**shadcn:** Table, Input, Select, Badge, Button, Pagination, Sheet (mobile filters), Skeleton.

---

### 3.6 `/batteries/new` — Log a battery **(mobile-first)**

| | |
|---|---|
| **Purpose** | Take a battery from a photograph to a confirmed, classified, placed record. |
| **Who uses it** | P1, P6. (P4 in B3 — see `SITE_ARCHITECTURE.md` RN-2.) |
| **Primary action** | Step 1 **Take photo** · Step 2 **Confirm and continue** · Step 3 **Confirm and log battery** |
| **On success** | `battery_record` written, photo + label crop + confirmed facts stored as a linked set, `classification_decision` written with reasoning, storage clock joined, redirect to `/batteries/[id]` with **Log another**. |
| **On failure** | Draft `intake_session` always survives. Nothing partial commits. Every failure names what failed and what to do. |

**What's on it — step 1, Photo.** `PhotoCaptureStep` (§2.2). Capture types: Label (required) · Whole pack · Damage. Container context, if entered from a container, shown as a `Badge` and carried through.

**What's on it — step 2, Extraction review.** `ExtractionReviewCard` (§2.1) with `CatalogMatchPanel` (§2.13). The whole confidence gate lives here. Branches: low confidence → §2.1.4(5); catalog miss → §5 E-5; no read → §5 E-4.

**What's on it — step 3, Confirm and place.**
- **Assessed condition** (hard-gated, confirmed here if not already) and state of charge at intake.
- **Container or lot assignment** — `Command` picker showing each container's current fill and clock tier so the handler does not put a battery into a container that expires next week.
- **Classification outcome** — light waste category vs full hazardous, rendered as a `Card` with **the recorded reasoning shown, not hidden behind a disclosure**: every input used, every rule identity and version applied, the citation each carried, the outcome, and any obligations it triggers (Rule 3.7). The reasoning trail is what survives an audit; it is not a detail view. Classification runs only after identification is confirmed (Rule 3.3), and **blocks rather than defaults** where an input is missing (Rules 3.4, 3.10) — see E-13.
- **A full-hazardous outcome** states the manifest obligation prominently here and carries it onto the container, the shipment and the shipping paper's checklist. **B1a does not generate a manifest, and the shipment is never presented as fully documented** (Rules 3.11, 3.12) — see E-14.
- **A light-category outcome does not exempt anything from a shipping paper.** Every shipment needs one regardless (Rule 5.4). This is the most commonly misunderstood point in the domain and no screen may imply otherwise (Rule 3.13).
- **Storage clock preview** — the clock this record will join and its current tier. **An overdue container cannot be selected** (Rule 4.16), and the picker says why rather than hiding it.
- **A damaged-or-defective indicator confirmed** → `HardBlockNotice` (§2.6) appears immediately with the handling consequences carried by the rule version as data, and the record must be routed to a **segregated quarantine container** — it cannot remain in general stock (Rules 6.15, 6.17). Flow D.
- **Summary strip** — every confirmed field, one last read-through before commit.

**Mobile-first specifics.** Camera full-bleed. One decision per screenful. `MobileActionBar` (§2.15). Nothing in the flow requires two hands, a hover, a drag or a long-press. Step state in the URL so a locked phone loses nothing.
**Desktop changes.** Two-column: label crop and photos left (sticky), field rows right. All three steps still separate — desktop does not collapse them into one long form. Keyboard: Tab through rows, Enter confirms, `⌘Enter` submits the step.

**shadcn:** Card, Form, Input, Select, RadioGroup, Checkbox, Badge, Progress, Alert, AlertDialog, Command, Tooltip, Skeleton, Separator, Button.

---

### 3.7 `/batteries/[id]` — Battery record

| | |
|---|---|
| **Purpose** | Everything known about one battery, and the evidence for each of it. |
| **Who uses it** | All six. Write for P1/P6. |
| **Primary action** | **Edit assessed condition** (P1/P6) · **Print documents** (all) |
| **On success** | Edits write immediately with a toast and an `audit_event`; the history tab updates. |
| **On failure** | Optimistic edit rolls back with a `critical` toast naming the field and the reason. |

**What's on it.** Header: record ID (mono, copyable), manufacturer + model, chemistry, `StatusBadge` for assessed condition, container link (P1/P2/P6 only — §5.4 of `SITE_ARCHITECTURE.md`), storage clock tier.

Tabs:
- **Overview** — identity fields with **each value's source retained and visible** (Read from label / Matched from catalog / Decoded / Detected from image / Entered by *name*). Specification. Classification outcome with its recorded reasoning. Placement and clock. `[B2]` reserves a section for `hazard_ranking` — **rendered as a relative ranking with a stated basis per factor when it arrives, never as a probability or percentage** (`_ANCHORS.md` §7.1).
- **Photos & extraction** — every `intake_photo`, the label crop, and the full `label_extraction` with per-field confidence and the extracted-vs-confirmed pair. Also shows the record's **training-eligible state** and the Terms of Service version in force at capture, so eligibility can be verified from outside the system rather than trusted (Rules 7.16, 7.22). Read-only after commit.
- **Documents** — every `document_render` touching this record, each linking to `/documents/[id]`. Voided renders appear here, marked void, with their reason and actor (Rules 5.14, 5.15).
- **History** — the `audit_event` trail, newest first, each with actor, time and what changed. Any superseded `damage_assessment` is displayed **alongside** the current one with its author, timestamp, indicators and evidence (Rule 6.12).

**Editing a confirmed field creates a superseding version — it never overwrites.** Prior values, their confirmer and their timestamps stay readable. **A correction to chemistry, model or condition re-opens the confidence gate for that field** and requires confirmation again (Rule 2.32); a condition change also triggers a re-classification check (Rules 3.15, 6.20). The edit `Dialog` says so *before* the change is saved, not after.

**A damaged-or-defective or recalled record** → persistent, non-dismissible `HardBlockNotice` at the top of every tab, plus the quarantine routing requirement (Rule 6.17).

**shadcn:** Card, Tabs, Badge, Table, Alert, Dialog, DropdownMenu, Tooltip, Separator, Button.

---

### 3.8 `/review` — Review queue

**This route has two distinct compositions, not one composition with permissions applied.** P1 and P6 get a work queue. P2 gets a compliance view. Build them as two views behind one route, selected from the role→route capability map (`SITE_ARCHITECTURE.md` §5.3), not as one component with controls switched off.

---

#### 3.8a — P1 and P6: the work queue

| | |
|---|---|
| **Purpose** | Clear every extraction the confidence gate held back, and every field still awaiting human confirmation. |
| **Who uses it** | P1, P6. |
| **Primary action** | **Confirm and commit** on the selected item. |
| **On success** | The record commits, leaves the queue, decrements the badge, and offers **Next item** — the queue is worked, not browsed. |
| **On failure** | The item stays queued. Nothing is lost, nothing auto-resolves, nothing ages out (Rule 2.23). |

**Two ways out, and only two** (Rule 2.23): a human confirms, or a human **voids with a stated reason**. There is no dismiss, no snooze, no bulk-clear and no age-out. Only P1 and P6 may confirm (Rule 2.22).

**What's on it.** Desktop: a two-pane layout — queue list left (sorted **oldest first**, with age, container context and a count of flagged fields), `ExtractionReviewCard` (§2.1) right. Mobile: the list; tapping opens the card full-screen with **Next** / **Previous**.

**This is the same `ExtractionReviewCard` as `/batteries/new` step 2. Not a second implementation.** Selected item in the URL (`?item=`) so a dashboard alert deep-links to it.

Also holds: sessions abandoned mid-intake, sessions whose photo upload never completed (E-3), and re-match confirmations raised by an approved catalog entry (Flow F).

**Empty:** *"Nothing to review. Every reading has been confirmed."* with the `ok` icon and a link to `/batteries`. This is a **good** empty state and should read like one.

**shadcn:** Card, ScrollArea, Badge, Button, Checkbox, Input, Select, Alert, AlertDialog, Skeleton, Separator.

---

#### 3.8b — P2: the unidentified-inventory view (view-only)

| | |
|---|---|
| **Purpose** | Answer P2's question, which is not P1's: **which batteries sitting in my containers are still unidentified, and which containers are they in?** |
| **Who uses it** | P2. View-only (`_ANCHORS.md` §5; Rule 2.22; `SITE_ARCHITECTURE.md` CL-1). |
| **Primary action** | **Open the container** → `/containers/[id]`. Her next move is a storage action, not an identification action. |
| **On success** | She leaves for the container or the battery record with the context she came for. |
| **On failure** | List error state per `RecordTable` (§2.7). Nothing here mutates, so there is no failed-write path. |

**Why she is here, stated on the screen.** A `neutral` `Alert` at the top, in her language rather than the pipeline's:

> **7 batteries in your containers aren't identified yet.**
> Until a handler confirms what these are, they can't be classified — so they can't be checked against their container's segregation class or clocked against the right accumulation period.

That copy is doing real work: it explains why an intake backlog is a storage problem (Rules 2.8, 3.3, 4.28, 4.5), which is the whole reason this view exists.

**What's on it — composed for her, not inherited from P1.**

- **Grouped by container, not sorted oldest-first.** P1 works a chronological queue; P2 audits a physical space. Default grouping is container, then site; secondary sort is age within the group.
- Columns: **Container** (primary, links to `/containers/[id]`) · Site · Record or session ID · Age in queue · The container's storage-clock tier (`StorageClockMeter` inline, §2.4) · The container's segregation class · Flagged-field count.
- **A container-level roll-up row** per group: *"C-14 · 3 unidentified of 22 · clock 60-day · quarantine class"*. This is the row she acts on.
- Filters: site, container, clock tier, age. Export, consistent with her other lists (`/batteries`, `/audit`).
- Row tap opens a **read-only summary panel**, not `ExtractionReviewCard`: the label crop, the fields as read with their confidence bands and sources, and a plain statement of what is unconfirmed — *"Chemistry, model and condition are not yet confirmed."*

**What is deliberately absent — not disabled.**

`Confirm`, `Confirm all high-confidence fields`, `Change`, `Reject`, `Void`, `Confirm and commit`, and the `ExtractionReviewCard` itself **do not render for P2**. Not greyed out, not tooltipped, not present.

**This is the opposite treatment from P5 (§2.9, E-8a), and the difference is deliberate.** P5 is an auditor assessing the system's controls — controls she cannot see cannot be assessed, so they render disabled with a stated reason. P2 is a colleague doing a different job, and a greyed-out **Confirm** in front of her is an invitation to ask for a permission that Rule 2.22 exists to withhold. A view that looks like a broken version of P1's screen teaches her she is missing something; a view composed around her question teaches her the product understands her role. **Absent for the colleague, disabled for the auditor.**

**What she can do instead** — each of these is a real, present, primary-weight action:

| Action | Goes to |
|---|---|
| Open the container holding the unidentified records | `/containers/[id]` |
| Open a battery record | `/batteries/[id]` |
| Record a storage event on the affected container | `/containers/[id]` → dialog |
| See the storage-clock alerts these containers already carry | `/containers?filter=alerting` |
| Export the list for an insurer or inspection file | download |

**Empty (P2):** *"Every battery in your containers has been identified."* `ok` icon, and a link to `/containers`. Phrase it as her assurance, not as an absence of work — it is the state she wants to be in.

**shadcn:** Table, Card, Alert, Badge, Progress, Input, Select, Button, Sheet (mobile filters), Skeleton, Separator. **No AlertDialog, no Checkbox** — there is nothing here to confirm.

---

### 3.9 `/containers` — Containers

| | |
|---|---|
| **Purpose** | See every container's fill and storage clock at a glance, and which need action. |
| **Who uses it** | All six. Detail only for P1/P2/P6. |
| **Primary action** | **New container** (P1/P2/P6) |
| **On success** | Row opens `/containers/[id]` for roles that may. |
| **On failure** | `RecordTable` error state. |

**What's on it.** `RecordTable` with an inline `StorageClockMeter` and `ContainerFillMeter` per row. Columns: Container label ID (mono) · Location · Record count · Fill · Storage clock tier · Ready-to-ship status. Filters: clock tier, location, over-threshold, ready-to-ship. `?filter=alerting` is a supported deep link from `/`.

**For P3, P4 and P5 the rows are not links** — no hover, no pointer, no ring, and a tooltip / tap-to-reveal naming the roles who may open the detail (`SITE_ARCHITECTURE.md` §5.4). This is the single easiest thing on this route to build wrong.

**shadcn:** Table, Progress, Badge, Button, Select, Tooltip, Pagination, Skeleton.

---

### 3.10 `/containers/[id]` — Container

| | |
|---|---|
| **Purpose** | Work one container: contents, clock, volume against threshold, printable label. |
| **Who uses it** | P1, P2, P6 — with different write sets (`SITE_ARCHITECTURE.md` §5.5). |
| **Primary action** | P1/P6: **Ship this container** → `/shipments/new?containers=`. P2: **Mark ready to ship**. |
| **On success** | The action routes or writes a `storage_event`, re-tiers the alert, and toasts. |
| **On failure** | The action fails in place with a stated reason; contents and clock stay readable. |

**What's on it.** Header: container label ID, location, `StorageClockMeter`, `ContainerFillMeter`, ready-to-ship `StatusBadge`, and any damaged/defective flag from its contents (Flow D3).

Tabs:
- **Contents** — every `battery_record` in the container, with condition and chemistry. Add / remove for P1/P6 only.
- **Label** — a `container_label` preview carrying the required regulatory phrase, the contents description and the **accumulation start date**, all from rule-version data (Rule 4.18), with **Generate / Reprint** → `/documents/[id]`. Available whenever the container holds anything; a shipment is not a prerequisite. Reprinting produces a new render superseding the old; the old is retained (Rule 4.20). The system **flags** when a label must be regenerated — start date changed, contents description changed materially, or the label rule version changed — **and a human prints** (Rule 4.21).
- **History** — `storage_event`s and `audit_event`s, including any recorded remediation **with its stated reason**.

**Two compliance flags that block shipping, shown on the header, not buried:** a container holding contents with **no current printed label** is non-compliant under the container-marking method and cannot be added to a shipment (Rule 4.22); a container whose printed start date no longer matches its current one is **mislabelled** and must be relabelled first (Rule 4.19).

**Storage-event dialog** (all three roles): event type, note, timestamp. **Remediation** on an overdue container (P2/P6 only) is an `AlertDialog` requiring a typed statement of what was done and why; it is an audited event and **does not alter the accumulation start date** (Rule 4.17).

**There is no re-date control on this screen, for any role.** The accumulation start date is set by the first placement and travels with the records; moving, consolidating or splitting never restarts it (Rules 4.4, 4.9–4.12). A re-date affordance would be a way to restart a legal clock, and the system must make that impossible rather than discouraged.

**Segregation:** a container holds **one** segregation class; placing an item of a different class is blocked with a stated reason (Rule 4.28). Quarantine containers hold only the quarantine class (Rule 6.18).

**Over the quantity limit** → the `ContainerFillMeter` over-limit state (§2.5), with the value, unit and source stated as supplied by rule data. Never a literal. **B1a warns; it does not block** (Rule 4.26).

**shadcn:** Card, Tabs, Progress, Badge, Table, Dialog, AlertDialog, Alert, Button, Textarea, Separator.

---

### 3.11 `/shipments` — Shipments

| | |
|---|---|
| **Purpose** | The shipment ledger — every movement, retained for the period the jurisdiction rule supplies, never a number written into the product (Rules 5.18, 1.23). |
| **Who uses it** | All six. |
| **Primary action** | **Build a shipment** (P1/P6) · **Export** (P2/P5/P6) |
| **On success** | Row opens `/shipments/[id]`. |
| **On failure** | `RecordTable` error state. |

**What's on it.** `RecordTable`. Columns: Shipment number (mono) · Date · Destination · Transport mode · Record count · Containers · Shipping paper status. Filters: date range, mode, destination, containing-damaged-records.

**shadcn:** Table, Badge, Button, Select, Pagination, Skeleton.

---

### 3.12 `/shipments/new` — Build a shipment

| | |
|---|---|
| **Purpose** | Assemble containers or lots into a shipment and generate its shipping paper. |
| **Who uses it** | P1, P6. |
| **Primary action** | Step 1 **Continue** · Step 2 **Continue** · Step 3 **Generate shipping paper** |
| **On success** | `shipment` written, `shipping_paper` rendered, container labels made available, redirect to `/shipments/[id]`. |
| **On failure** | Draft preserved; contents changed under the user → re-validate, name what changed, return to step 1 with the selection intact. |

**What's on it — step 1, Contents.** Multi-select over containers and lots, each row showing fill, clock tier and condition flags. A live summary: record count, chemistries present, aggregate mass and energy where known, and **any damaged/defective record named explicitly**.

**What's on it — step 2, Transport.** `RadioGroup` for transport mode. **This is where the air block lives.** With a damaged, defective or recalled record in scope, the Air option renders **visible and not selectable** with `HardBlockNotice` (§2.6) above it carrying all five required parts — statement, citation from the rule version, blocking records, the triggering indicator per record, and the three permitted paths (Rules 6.9, 6.10). Adding such a record after air was selected is blocked at assembly (Rule 6.13); confirming damage on a record already on an open air shipment removes it automatically, voids the paper, returns the shipment to a regenerate state and notifies P1 and P2 (Rule 6.14). **No override exists for any role, including P6** (Rules 6.8, 1.20). The server re-checks at commit.

**What's on it — step 3, Review and generate.** A **precondition checklist that names every unmet item** rather than a single "can't generate" message (Rule 5.3): unconfirmed identifications, records with no active classification, mode conflicts, an unverified 24-hour emergency number, missing destination or transporter details, and **missing shipping identifiers** — which are derived from the matched catalog entry plus the active classification, never free-typed and never guessed, so an unmatched record blocks here (Rule 5.9).

Then: the generated basic description per line; emergency response information from rule-version data (Rule 5.5); the **verified** 24-hour emergency contact number — missing, unverified or expired **blocks generation**, is never omitted from the document and is never replaced with a placeholder (Rules 5.6, 5.7), with a link for P2/P6 and, for P1 who cannot reach that route, copy naming who can (E-11). Per-line classification outcome with reasoning. Where any line classified full hazardous, **the manifest obligation is stated prominently and the shipment is never shown as fully documented** (Rule 3.12, E-14). Where a packaging exception applies, its eligibility, the criteria used and the citation are shown — and the system **never assumes eligibility** (Rules 5.19, 5.20). A final `AlertDialog` before commit.

**A shipment never mixes organizations** (Rule 5.24) and **a record already on an open shipment cannot join a second** (Rule 5.25) — both blocked at assembly in step 1, not detected afterwards.

**shadcn:** Card, Table, Checkbox, RadioGroup, Select, Alert, AlertDialog, Badge, Button, Separator, Skeleton.

---

### 3.13 `/shipments/[id]` — Shipment

| | |
|---|---|
| **Purpose** | One shipment with its generated shipping paper, contents and history. |
| **Who uses it** | All six read; P1/P6 reprint and re-render. |
| **Primary action** | **Print shipping paper** |
| **On success** | Opens `/documents/[id]`; the print writes an `audit_event`. |
| **On failure** | Render failed → `critical` `Alert` with **Retry**. The `shipment` still exists; it cannot be marked shipped without a rendered paper. |

**What's on it.** Header: shipment number, date, destination, transport mode `StatusBadge`, and any damaged/defective flag. Tabs: **Shipping paper** (embedded `DocumentViewer`, Print, Download, and **Print container label** per container) · **Contents** (records and containers, each linked) · **History** (`audit_event`s including every render and reprint).

**shadcn:** Card, Tabs, Table, Badge, Alert, Button, Separator.

---

### 3.14 `/documents/[id]` — Document

| | |
|---|---|
| **Purpose** | View, print or download any generated document in a print-accurate layout. |
| **Who uses it** | All six, including P5. |
| **Primary action** | **Print** |
| **On success** | Browser print against the print stylesheet; `audit_event` written. |
| **On failure** | Render failure state with **Retry** and a link to the source record. |

**What's on it.** `DocumentViewer` (§2.8) plus a metadata strip: document type, generated at, generated by, source record, render instance ID (mono, copyable). **Print and Download are never disabled for any role that can reach this route** — reading and printing evidence is the auditor's job; P5 may view and download within an active grant's scope and may generate nothing (Rule 5.27). Authenticated only; there is no public document URL in B1a (`SITE_ARCHITECTURE.md` §5.6).

**Every render is immutable.** No render is edited after generation by any role, including P6 (Rule 5.12). A correction produces a **new** render that references the one it supersedes; both are retained, both readable, and the superseded one is **clearly marked as no longer valid** (Rule 5.15). A voided render renders with a full-page `critical` void treatment carrying the reason and the actor, and remains in audit and evidence exports (Rules 5.13, 5.14). **Void marking must survive printing** — it is part of the print stylesheet, not an on-screen overlay.

**Label and mark artwork is versioned.** The version applied is the one in force **on the print date**, not the shipment creation date; a reprint after an artwork rule changes uses the new version and supersedes the old render (Rules 5.21, 5.22). No artwork requirement is drawn into a template as a fixed design.

**shadcn:** Card, Button, Badge, Alert, Separator, Skeleton.

---

### 3.15 `/catalog` — Catalog

| | |
|---|---|
| **Purpose** | Search known battery products to match a record or check a specification. |
| **Who uses it** | All six. |
| **Primary action** | **Search** |
| **On success** | Row opens `/catalog/[id]`. |
| **On failure** | `RecordTable` error state. |

**What's on it.** `RecordTable` with a prominent search. Columns: Manufacturer · Model / part number (mono) · Chemistry · Form factor · Nominal voltage · Capacity/energy · Records matched. Filters: chemistry, form factor, manufacturer, battery class — **and the class filter includes small mobility-device packs from day one** (`_ANCHORS.md` §0). Supports `?q=` for the deep link from the intake catalog-miss state.

**shadcn:** Table, Input, Select, Badge, Pagination, Skeleton.

---

### 3.16 `/catalog/[id]` — Catalog entry

| | |
|---|---|
| **Purpose** | One known product's specification, and the records matched to it. |
| **Who uses it** | All six. Edit for P6. |
| **Primary action** | **Edit this entry** (P6 only) → `/settings/catalog?entry=` |
| **On success** | Navigates to the edit surface. |
| **On failure** | Detail load failure → `critical` `Alert` + **Retry**. |

**What's on it.** Manufacturer and model, chemistry, form factor, specification, certification marks, source and last-updated. A list of `battery_record`s matched to this entry, linked. No edit affordance renders for non-P6 roles.

**`[B1b]` reserves space for the format band — and reserves it as a *list*, not a field.** A format band is a `format_classification`, keyed on `(battery_record, jurisdiction, rule_version)`, because **the same battery classifies differently in different states** (`_ANCHORS.md` §3; Rule 3.5). B1a renders none. But B1a must not render a single organization-wide size or format value anywhere either — doing so bakes in exactly the assumption that entity exists to prevent, and B1b then has to unpick the screen instead of filling it in.

**shadcn:** Card, Badge, Table, Button, Separator.

---

### 3.17 `/settings/organization` — Organization

| | |
|---|---|
| **Purpose** | The org profile, the 24-hour emergency contact, and the jurisdiction profile that supplies every threshold in the product. |
| **Who uses it** | P2, P6. |
| **Primary action** | **Save changes** |
| **On success** | Toast + `audit_event`. Changing the jurisdiction profile re-evaluates every container's threshold state and re-tiers alerts. |
| **On failure** | Field-level validation; nothing partially saves. |

**What's on it.**
- Organization name, address, handler identification.
- **24-hour emergency contact number** — recorded **and verified** before it can be used on a document. Verification is a recorded act with a date and an actor, shown next to the number (Rule 5.6). Missing, unverified or expired → an `attention` `Alert` at the top of this page **and** the block on `/shipments/new` step 3 (Rule 5.7, E-11).
- **Clock demonstration method** per site — container-marking or inventory — recorded with its effective date and included in every audit and evidence export. **Changing the method does not restart any clock**, and the UI must say so at the point of change (Rules 4.2, 4.3).
- **Terms of Service state** — the accepted version, who accepted it, when, and any grace window with its re-acceptance deadline. A published new version notifies on publication, at the in-force date and before the deadline; records captured during a grace window bind permanently to the **prior** version's terms (Rules 7.12, 7.13, 7.15). A lapsed deadline blocks intake organization-wide (Rule 7.14, E-12).
- **Jurisdiction profile — per site, not per organization.** Which `jurisdiction` each site sits in and the `rule_version` in force there. This is the input that supplies every threshold, deadline and citation the product displays. Rendered as data, read-only in B1a, with a **stated effective date and source for each rule**. **Not one value here is a literal in code** (Rule 1.23; `PROJECT_SETUP_BMMP.md` §8.1). An organization with sites in two states holds two profiles and classifies the same battery two ways, correctly (Rule 3.5) — **the UI must never present one org-wide jurisdiction**, even when there is only one site today.
- Retention — displayed as read from jurisdiction data with its source, never as an editable number (Rules 5.18, 1.23; BR §12).

**shadcn:** Card, Form, Input, Select, Alert, Badge, Table, Button, Separator.

---

### 3.18 `/settings/users` — Members and roles

| | |
|---|---|
| **Purpose** | Invite people and set what each can do. |
| **Who uses it** | P2, P6. |
| **Primary action** | **Invite member** |
| **On success** | Invitation created, token issued, row appears as pending, `audit_event` written. |
| **On failure** | Duplicate email → inline. Insufficient privilege → the role `Select` disables the options this actor cannot grant, with a stated reason. |

**What's on it.** Member table: name, email, role (`StatusBadge`), status, binding authority, last active, joined. Row actions: change role, resend invitation, deactivate. **Only P2 and P6 may invite, revoke an invitation, or assign a role** (Rules 1.9, 1.10). **No user changes their own role** (Rule 1.11). Each role option carries a one-line plain-language description of what it can do, drawn from the same role map the guard reads (`SITE_ARCHITECTURE.md` §5.3) — so the description can never drift from the enforcement.

**Members are deactivated, never deleted.** A deactivated member's name stays attached to every record and audit event they created, forever (Rule 1.13). The control says "Deactivate", never "Delete", and the `AlertDialog` states that their history remains.

**The organization must always keep at least one active binding-authority member.** An action that would remove the last one is blocked with a stated reason (Rules 1.12, 1.11), and the UI names the remedy rather than just refusing.

**P5 grants are separate and always expire.** Granting auditor access requires a scope and an expiry; **a grant with no expiry cannot be created**, and the date field has no "never" option (Rule 1.15). Expiry terminates access immediately, including inside an open session (Rule 1.28).

**shadcn:** Table, Dialog, AlertDialog, Form, Input, Select, Badge, DropdownMenu, Button.

---

### 3.19 `/settings/catalog` — Catalog administration

| | |
|---|---|
| **Purpose** | Approve, edit and reject proposed catalog entries. |
| **Who uses it** | P6 only. |
| **Primary action** | **Approve entry** |
| **On success** | Entry becomes searchable at `/catalog`; matching unmatched records are raised on `/review` for human confirmation — **never silently re-matched** (Flow F). |
| **On failure** | Validation inline; the proposal stays queued. |

**What's on it.** Two lists: **Proposals** (from intake catalog misses, with the proposing user, the linked `intake_photo` and label crop side by side with the proposed fields) and **All entries** (editable). Approve / Reject with a required reason. Rejected proposals return to `/review` as manual-entry items.

**shadcn:** Table, Card, Form, Input, Select, Dialog, AlertDialog, Badge, Button, Tabs.

---

### 3.20 `/audit` — Audit log

| | |
|---|---|
| **Purpose** | Read and export the record of every action the system and its users took. |
| **Who uses it** | P2, P5, P6. **Not P1.** |
| **Primary action** | **Export** |
| **On success** | CSV download; the export itself writes an `audit_event`. |
| **On failure** | Export failure states the reason and offers a narrower range. |

**What's on it.** `RecordTable`, newest first. Columns: Timestamp (absolute, tabular) · Actor · Role · Event type · Entity (linked, role-filtered) · Summary. Filters: date range, actor, role, event type, entity type. Expandable row detail showing before/after where applicable.

**Includes access denials and blocked attempts** — a refused air-transport selection, a refused route and a refused P5 write are all events, and they are evidence (Rules 1.16, 6.21; `SITE_ARCHITECTURE.md` §5.3). Actions taken by P6 under a support grant are **marked as platform actions, visibly distinguishable from a tenant member's** (Rule 1.18).

**No role, including P6, may edit or delete an audit event** (Rule 1.21). There is no delete control, no bulk-clear and no retention override on this screen for anyone.

For P5 this is the primary destination and the `ReadOnlyBanner` (§2.9) is present. Export is **not** disabled for P5.

**shadcn:** Table, Input, Select, Badge, Button, Pagination, Sheet (mobile filters), Skeleton.

---

## 4. Responsive Behavior

### 4.1 Breakpoints

| Name | Width | Primary user |
|---|---|---|
| `base` | < 640 | **Phone in a storage room. The design target for intake.** |
| `sm` | ≥ 640 | Large phone, small tablet portrait |
| `md` | ≥ 768 | Tablet — sidebar becomes an icon rail, bottom bar disappears |
| `lg` | ≥ 1024 | Laptop — full sidebar, two-column details |
| `xl` | ≥ 1280 | Desk / wall-mounted screen — content caps at 1280 |

### 4.2 Mobile-first, and what that means here

**`/batteries/new` is designed at 375px and adapted upward.** Not the reverse. P1 photographs labels standing at a pallet; P4 does the same at a customer site in B3. A desktop-first intake that "also works on mobile" fails the primary use.

| Aspect | Mobile (< 768) | Desktop (≥ 1024) |
|---|---|---|
| Intake step 1 | Full-bleed camera, 72px shutter, thumbnail strip | Drop zone + file picker; camera offered but never the default |
| Intake step 2 | Single column: label crop thumbnail on top, field rows stacked, sticky action bar | Two columns: photo and label crop sticky left, field rows right; keyboard-first |
| Intake step 3 | One decision per screenful; container picker as a full-screen `Command` | Single screen; container picker as a `Popover` |
| Field row | Value on its own line, confirm button full-width below | Value, source, confidence and confirm on one line |
| Primary action | `MobileActionBar`, 56px, full-width, sticky | Inline, right-aligned, 40px |
| Navigation | Bottom tab bar + More `Sheet` | Sidebar 240px, collapsible to 64px rail |
| Tables | Card list; two priority columns + a `StatusBadge`; tap opens detail | Full table, all columns, sortable |
| Filters | **Filters** button → bottom `Sheet` with an active count | Inline filter row |
| Detail tabs | Horizontally scrollable, current tab pinned left | Full tab bar |
| Documents | Fit-to-width, pinch zoom, Print in the sticky bar | Fit-to-page, toolbar zoom |
| Dialogs | Full-screen `Sheet` from the bottom | Centred `Dialog`, max-width 560px |
| Two-pane `/review` (P1/P6, §3.8a) | Single pane, list → full-screen card, Next / Previous | Two panes, list left, card right |
| `/review` for P2 (§3.8b) | Container roll-up rows only; tapping opens the read-only summary as a `Sheet` | Grouped table with roll-up rows; summary opens in a right-hand panel. **Never the two-pane review layout** — the composition differs by role, not just the density |

### 4.3 Orientation, zoom and reachability

- **Landscape phone is supported** in the intake flow — a battery on a shelf is often photographed sideways. The action bar stays bottom-anchored and the field rows scroll.
- **200% browser zoom must not break any layout.** No fixed pixel heights on text containers.
- On phones, primary actions sit in the bottom third of the screen. Nothing required for a task lives in the top-right corner.
- Every layout respects `env(safe-area-inset-*)`.

---

## 5. Edge Cases and Empty States

**This is where builds fail.** Every case below is a required, testable state with named copy. A build that renders a blank region for any of these is incomplete. **E-1 through E-14 carry the same identifier and the same meaning in `SITE_ARCHITECTURE.md` §6**, which states the routing consequence of each; this section states the appearance and behaviour.

Every empty state has exactly four parts: **what is true · why · the single most useful next action · who can take it if this role cannot.**

---

### E-1 — Zero batteries

**Where:** `/`, `/batteries`.

| Role | Copy | Action |
|---|---|---|
| P1, P6 | *"No batteries logged yet. Log your first one — photograph the label and we'll read it."* | **Log a battery** → `/batteries/new` |
| P2 | *"No batteries logged yet. Once your handlers start logging, containers and storage clocks appear here."* | **View containers** |
| P3, P4 | *"No batteries logged yet."* | **View catalog** |
| P5 | *"No battery records in this organization yet. The audit log shows everything that has happened so far."* | **Open the audit log** |

**Never show a create action to a role that cannot create.** A dead CTA is worse than no CTA.

---

### E-2 — Zero containers

**Where:** `/containers`, `/batteries/new` step 3, `/shipments/new` step 1.

- `/containers` — P1/P2/P6: *"No containers yet. Create one to start a storage clock."* → **New container**. P3/P4/P5: the same first sentence, plus who can create one.
- **Intake step 3 with no containers** — the container picker renders a `HardBlockNotice`-styled `Alert`: *"You need a container before you can log a battery — the storage clock starts when the battery goes into one."* P1/P6 get **Create a container** inline, which returns to step 3 with it selected. Other roles get the names of who can. **The intake draft is never discarded to go create a container.**
- `/shipments/new` step 1 — the picker is replaced by an explanatory state, not an empty list.

---

### E-3 — A photo fails to upload

**Where:** `/batteries/new` step 1.

1. The thumbnail takes a `critical` border and a **Retry** overlay. Toast: *"Photo not sent — it's kept on this device."*
2. Two automatic retries with backoff, each visible as a state, never silent.
3. The photo stays in the local queue (§2.10). The user may keep shooting.
4. The user may leave. The `intake_session` persists as a draft and appears on `/review` as an unprocessed session with its pending capture count. **Work is never lost.**
5. **The flow does not advance to step 2 without at least one uploaded label photo** — the extraction has nothing to read. Manual entry is offered instead, subject to RN-1.
6. Permanent failure after reconnection: `critical` `Alert` naming each failed photo with **Retry** and **Remove**. Removal requires an explicit act; nothing is discarded on the user's behalf.

---

### E-4 — The label cannot be read at all (zero fields extracted)

**Where:** `/batteries/new` step 2, `/review`. **Distinct from low confidence and must not share its treatment.**

The field rows are replaced by:

> **We couldn't read anything from this label.**
> The photo may be too blurred, too dark, at too steep an angle, or the label may be worn.
>
> **Re-take the photo** · **Enter the details by hand** · **Search the catalog**

Plus the captured photo at full width with three concrete tips (fill the frame with the label; avoid glare — try turning the torch off; hold the phone parallel to the label). The `intake_photo` and the failed `label_extraction` are both **retained** — an unreadable label is itself a useful training example (Rules 2.29, 7.11; D-7).

**Where the label is absent, destroyed or unreadable**, the record follows the manual entry path and **the reason is recorded as a stated value from the taxonomy's unreadable-label reason set** — a required `Select`, not free text (Rule 2.29). **The photos are still captured and retained** even on this path: at least one photo is required before extraction runs (Rule 2.5), and the manual path is an alternative to *extraction*, not to *photography*. There is no photoless intake.

Entering by hand puts every field in the `Entered by you` source state; the three hard-gated fields still require explicit confirmation. **Manual entry does not bypass the gate.**

---

### E-5 — Catalog miss, no match found

**Where:** `/batteries/new` step 2, `/review`.

`CatalogMatchPanel` empty state (§2.13):

> **No catalog match found.**
> We read the label but this product isn't in the catalog yet. You can still log this battery.
>
> **Search the catalog** · **Enter details manually** · **Propose a new catalog entry**

- The record **can** be committed unmatched, on the manual entry path, marked as **manually identified** (Rule 2.20). It still classifies, still gets a storage clock.
- **Chemistry becomes a manual entry, explicitly confirmed by a person** (Rule 2.10). It is never inferred, never guessed, never interpolated from a similar product and never left to a default (Rule 2.11; `_ANCHORS.md` §7.2).
- **But it cannot ship yet, and this screen must say so now.** Shipping identifiers derive from the matched catalog entry plus the active classification; a record with none **blocks shipping-paper generation** (Rule 5.9). The empty state carries a second line: *"You can log this battery now. It can't go on a shipping paper until this product is in the catalog."* Discovering that later, at `/shipments/new`, is a failure of this screen.
- Proposing an entry queues it for P6 at `/settings/catalog` and shows: *"Sent to your admin. You can carry on."* — the proposal never blocks the handler.
- **Never auto-select.** Where several entries are plausible, the panel shows them as candidates and a person picks; the system never auto-selects the top candidate and never silently narrows a list to one (Rule 2.19). Only an **exact, unambiguous** match may pre-fill catalog-sourced fields, and those still require confirmation (Rule 2.18).
- When a proposal is approved, matching records are raised on `/review` for a person to confirm. **A confirmed chemistry is never changed silently by a later catalog approval.**

---

### E-6 — An overdue storage clock

**Where:** `/`, `/containers`, `/containers/[id]`, `/batteries/[id]`.

- `StorageClockMeter` `critical` state at 100%, with the overrun stated: *"14 days past the limit"*.
- Pinned to the top of `/` and ordered above every other alert.
- **Overdue is a hard state, not a warning** (Rule 4.15). **The container accepts no new items** — placement is blocked with a stated reason that names the two available paths (Rule 4.16). This is the one place where the product does block work, and it blocks it deliberately.
- Clears on exactly two events: the contents depart on a shipment, or **P2 records a remediation** stating what was done and why — an audited event, never a silent status change, and it **does not alter the accumulation start date** (Rules 4.7, 4.17).
- **There is no dismiss, snooze, pause, extend or re-date control, for any role including P6** (Rules 4.6, 4.9). There is nothing to disable — the controls do not exist.
- Every battery in the container carries the overdue state on its own record, and its start date travels with it if it moves (Rules 4.9, 4.10).
- A container that receives older contents **becomes overdue immediately** on receipt if the inherited earliest start date makes it so (Rule 4.10). Consolidation and splitting inherit the earliest date too (Rules 4.11, 4.12). The UI must show this happening at the moment of the move, not after a refresh.

---

### E-7 — A container over its fire-code quantity limit

**Where:** `/`, `/containers`, `/containers/[id]`.

- `ContainerFillMeter` over-limit state (§2.5): *"18.2 cu ft — over the 15 cu ft limit for this site."*
- **The number, the unit and the citation all come from jurisdiction and fire-code data via the site's profile.** The component renders what the rule supplies. **A literal limit or an assumed unit in this component is a review rejection** (Rule 1.23; `PROJECT_SETUP_BMMP.md` §8.1). Some jurisdictions measure by volume, others by energy — the UI must not assume which, and must render the unit the rule gives it.
- Raises a **warning to P2**, with the limit's source stated (Rule 4.26).
- **Blocks nothing in B1a, and B1a must not implement the monitoring, alerting or evidence behaviour ahead of its specification** (Rule 4.26). That work is `[B1b]` §9. A builder who adds pre-violation alerting here has built B1b early and wrong.
- **No limit configured for the jurisdiction:** the meter shows fill against capacity only plus *"No quantity limit set for this jurisdiction."* **Never substitute a default number.** A wrong limit is worse than an absent one.

---

### E-8 — A read-only role lands on a screen with editable controls

**Two cases that look alike and resolve oppositely.** Getting this wrong in either direction is a real defect, so the rule is stated as a rule: **disabled for the auditor, absent for the colleague.**

#### E-8a — P5 (auditor), read-only everywhere

**Where:** `/batteries/[id]`, `/shipments/[id]`, `/`, `/catalog/[id]`, `/documents/[id]`.

- `ReadOnlyBanner` (§2.9) below the page title.
- Mutating controls **render, disabled**, each with a tooltip / tap-to-reveal: *"Read-only access — Auditor role."* **The auditor is assessing the system's controls; controls she cannot see cannot be assessed.** That is the entire reason they stay visible.
- Destructive controls are **omitted entirely**.
- **Print, Download and Export are never disabled** — that is the auditor's whole task (Rule 5.27).
- Routes P5 cannot reach redirect to `/` with a toast naming the restriction (`SITE_ARCHITECTURE.md` §5.3). No 403 page, no crash, no blank screen.
- On `/containers`, container rows are non-navigating with the tooltip from §5.4. See `SITE_ARCHITECTURE.md` RN-1.
- Every P5 write attempt is denied server-side, surfaced with a stated reason, and **written to the audit log as an event** (Rules 1.14, 1.16). Server-side rejection is the real control; the disabled attribute is a courtesy.

#### E-8b — P2 (facility manager) on `/review`, view-only on one screen

**Where:** `/review` only. P2 writes freely elsewhere — `/containers/[id]`, `/settings/organization`, `/settings/users`.

- **No `ReadOnlyBanner`.** A banner announcing what she cannot do is the wrong frame; §3.8b opens with a `neutral` `Alert` stating what the screen is *for* — *"7 batteries in your containers aren't identified yet"* — and why it matters to her (Rules 2.8, 3.3, 4.28).
- **Confirm, Change, Reject, Void and `ExtractionReviewCard` are absent, not disabled.** She is not doing that job. A greyed-out **Confirm** in front of a colleague is an invitation to ask for a permission Rule 2.22 exists to withhold, and a screen that looks like a broken copy of P1's teaches her she is missing something.
- **The view is composed differently, not filtered down** (§3.8b): grouped by container rather than sorted oldest-first, with container-level roll-up rows, the segregation class and the clock tier — the columns her question needs, which P1's queue does not show.
- Every action she *can* take renders at primary weight: open the container, open the record, record a storage event, export the list.
- Server-side, a confirm or void request from P2 is rejected with a stated reason and audited, exactly as for P5 (Rule 2.22). **Composition is never the enforcement** — the absent control and the server check are independent, and both are required.

**The general rule, for any role/screen pair a later phase adds:** if the role's job is to *evaluate the system*, disable and explain. If the role's job is *something else entirely*, compose a different view. Never ship the same screen twice with half its buttons dead.

---

### E-9 — A damaged battery blocks air transport

**Where:** `/batteries/[id]`, `/containers/[id]`, `/shipments/new` step 2. Flow D.

- `HardBlockNotice` (§2.6): the block, the reason, every blocking record linked, and the permitted alternative.
- The Air option is **visible and disabled**, never hidden.
- If a damaged record enters the selection after air was chosen: the selection clears, a `critical` `Alert` names the record, **Continue** blocks.
- **No override, for anyone, including P6.** No "proceed anyway", no bypass dialog, no support path.
- Server re-checks at commit and rejects with the same stated reason.
- If the constraint check fails or has not returned, **fail closed** — the option stays unavailable.
- Every blocked attempt writes an `audit_event`.

---

### E-10 — Offline or a slow warehouse network

**Where:** everywhere. §2.10, RN-3.

| Situation | Behaviour |
|---|---|
| Offline, reading | Cached data with a stated timestamp — *"Showing information from 14:22"*, never "recently" |
| Offline, capturing | Photos capture and queue locally; each shows **Queued** |
| Offline, extraction | Not run: *"We'll read this label when you're back online."* Manual entry available now. |
| Offline, committing a hard-gated confirmation | **Blocked**, with the reason stated. Confirming chemistry against a stale catalog is not a confirmation. |
| Offline, printing | An already-rendered `document_render` prints from cache. A new render is queued with the reason stated. |
| Slow (> 3s) | Inline *"This is taking longer than usual"* + a working **Cancel** on every long operation |
| Reconnecting | *"Back online — sending 3 photos"* with determinate progress |
| Sync failure | Per-item `critical` state with **Retry**. Nothing is discarded without the user's explicit act. |

**Rule: no silent failure and no ambiguous state.** Every queued, failed or deferred item is individually visible and individually retryable. Timeouts state the elapsed time and offer a retry, never a spinner that runs forever.

---

### E-11 — The 24-hour emergency contact number is not set

**Where:** `/shipments/new` step 3, `/settings/organization`.

- Step 3 blocks with an `attention` `Alert`: *"A 24-hour emergency contact number is required on every shipping paper. It isn't set for this organization yet."*
- P2/P6 → **Set it now** → `/settings/organization`, returning to the draft.
- **P1 cannot reach that route.** They see: *"Ask your Facility Manager or an Admin to add it in Organization settings."* **Never a link the role will be redirected away from.**
- The shipment draft persists. Nothing is discarded.

---

### E-12 — No Terms of Service acceptance in force

**Where:** `/batteries/new`, `/`, `/settings/organization`.

**Intake is blocked organization-wide** until an acceptance is in force (Rules 7.1, 7.2). Every other read-only surface stays available so the organization can be set up while consent is pending — **do not lock the whole app.**

`/batteries/new` renders a `critical` `Alert` in place of the capture step:

> **Batteries can't be logged yet.**
> Your organization hasn't accepted the Terms of Service, which include the data training-rights grant.
> **<Name>** can accept this in Organization settings. → *(shown only to roles who can reach it)*

- The copy names **who** can accept: the founding member, or a P2 holding binding authority. **P1, P3 and P4 cannot accept on the organization's behalf; P5 cannot accept anything; P6 can never accept on a tenant's behalf, including under a support grant** (Rules 7.3, 7.4, 1.19).
- The same block covers a **lapsed re-acceptance deadline** (Rule 7.14), with copy naming the version and the date it lapsed.
- During a **grace window**, intake continues normally with a `neutral` banner stating the deadline. Records captured in the window bind permanently to the **prior** version's terms; accepting the new version afterwards does not move them (Rules 7.13, 7.15). The banner must not imply that accepting now covers them.

---

### E-13 — The site has no jurisdiction profile

**Where:** `/batteries/new` step 3, `/batteries/[id]`, `/containers/[id]`, `/shipments/new`.

**Classification is blocked, not defaulted** (Rule 3.10). There is no fallback jurisdiction, no "assume federal", no default threshold and no placeholder citation.

- The record sits in a blocked state that **names the missing input** and **who can supply it — P2 or P6** — and, for P1 who cannot reach `/settings/organization`, names them rather than linking somewhere P1 will be redirected away from.
- **No downstream document may be generated** while the block holds (Rule 3.10). `/shipments/new` lists it by name in the step 3 precondition checklist (Rule 5.3).
- The governing jurisdiction is the **site's**, not the organization's headquarters, billing address or destination — an organization with sites in two states classifies the same battery two ways, correctly (Rule 3.5). Any UI that presents one org-wide jurisdiction is wrong.
- The rule version applied is the one in force on the record's **intake date**, not today's (Rule 3.6), and the record detail states which version was used so a two-year-old decision stays explainable.

---

### E-14 — A line classifies as full hazardous

**Where:** `/batteries/[id]`, `/containers/[id]`, `/shipments/new` step 3, `/shipments/[id]`, the shipping paper.

B1a generates no hazardous waste manifest. The gap is **stated, never silent** (Rules 3.11, 3.12).

- The manifest obligation renders as an `attention` `Alert` on the record, the container, the shipment and the shipping paper's accompanying checklist — all four, not just one.
- **The shipment is never presented as fully documented.** No green tick, no "Ready to ship", no "All documents generated". The completion affordance states what is outstanding and that it is produced outside BMMP in B1a.
- A **light-category** outcome does not exempt anything from a shipping paper (Rules 3.13, 5.4). No screen may imply a light-category shipment needs no paperwork — this is the most commonly misunderstood point in the domain.
- Re-classification **supersedes, never overwrites**; the prior decision keeps its inputs, rule versions, citations and reasoning (Rule 3.14). A new rule version **never retroactively re-classifies a departed shipment** (Rule 3.16), and flags open records for re-evaluation as a **required action, not a dismissible notice** (Rule 3.17).

---

### E-15 — Other required states

| Case | Behaviour |
|---|---|
| **Zero review items** | *"Nothing to review. Every reading has been confirmed."* `ok` icon. A good state, styled as one. |
| **Zero shipments** | P1/P6: *"No shipments yet."* → **Build a shipment**. Others: who can. |
| **Zero catalog entries** | Only reachable in a fresh tenant: *"The catalog is empty."* P6 → **Add an entry**. Others: *"Ask an Admin to add entries, or propose one while logging a battery."* |
| **Zero audit events** | Practically unreachable — sign-in is an event. If it happens: *"No activity in this range."* + **Clear filters**. |
| **Filters exclude everything** | *"No results match these filters"* + **Clear filters**. **Never the zero-records onboarding copy.** |
| **Search returns nothing** | *"No matches for '<query>'"* + a scoped suggestion. |
| **Record not found / cross-tenant ID** | A plain not-found page with a route back. **Never disclose that the record exists in another organization** (`SITE_ARCHITECTURE.md` §5.3). |
| **Session expired mid-flow** | The draft persists. On re-authentication the user returns to the exact step. *"You were signed out. Your work is here."* |
| **Two people editing one record** | Last write wins, with a `neutral` `Alert` on the loser's screen naming who changed it and when, plus **Reload**. No silent overwrite. |
| **Very long values** | Middle-ellipsis truncation with the full value in a tooltip and always copyable in full. Never a broken layout. |
| **A status value the UI does not recognise** | Renders `neutral` with the raw value in mono and a console warning. **Never blank** (§2.3). |
| **Document render fails** | The source record is unaffected and stays readable; `critical` `Alert` with **Retry**; the shipment cannot be marked shipped without a rendered paper. |
| **Extraction service unavailable** | Photos still capture and store. Step 2 offers manual entry and a queued read. The session is preserved. |

---

## 6. Interaction Flows

Motion, feedback and transition behaviour. All durations per §1.6; all of it disabled under `prefers-reduced-motion`.

### 6.1 Feedback rules

| Outcome | Feedback |
|---|---|
| Action succeeded, user stays | Sonner toast, 4s, with an **Undo** where the action is reversible |
| Action succeeded, user navigates | Toast on the destination — never a toast on a page the user is leaving |
| Action failed, recoverable | Inline `critical` message beside the control, plus a toast if the control has scrolled out of view |
| Action failed, not recoverable | `critical` `Alert` in the content area with a stated reason and a route forward |
| Action blocked by a rule | `HardBlockNotice` (§2.6) — never a toast. **A toast disappears; a compliance block must not.** |
| Long-running operation | Determinate progress where a total is known, a text status where it is not, and always a **Cancel** |

### 6.2 The intake flow, timed

```
Tap shutter          →  80ms frame flash + haptic; thumbnail animates into the strip (200ms)
Upload               →  determinate ring on the thumbnail; user keeps shooting
Tap "Read label"     →  240ms slide to step 2; skeleton rows + "Reading label — about 5 seconds"
Extraction returns   →  rows fade in staggered 40ms apart, top to bottom (total ≤ 320ms)
                        Low-confidence rows are NOT animated differently — the gate banner
                        carries the message. Motion is never a status.
Confirm a field      →  row collapses over 120ms to its confirmed line; polite live-region announce
Last gate confirmed  →  primary action enables with a 120ms fill; the reason checklist fades out
Tap primary          →  button enters loading with its label replaced by "Logging battery…"
Commit succeeds      →  200ms cross-fade to /batteries/[id]; toast "Battery logged" + "Log another"
Commit fails         →  button returns to enabled; critical Alert above the action bar names the
                        field or rule that rejected it; nothing is lost
```

### 6.3 Loading strategy

| Situation | Treatment |
|---|---|
| First paint of a list or detail | `Skeleton` matching the final layout exactly — same row heights, same column widths. **Layout must not shift when content arrives.** |
| Navigation between routes | Next.js streaming with a route-level `loading.tsx`; the app shell never flashes |
| Action in flight | The button enters loading, keeps its width, and replaces its label with a present-participle status. **Never a bare spinner replacing a labelled button.** |
| Background refresh | Silent. Stale data stays visible; no spinner over readable content. |
| Slow (> 3s) | Inline notice + Cancel (§2.10) |

### 6.4 Optimistic updates — where they are permitted

**Permitted:** filter and sort changes, tab switches, adding a note, toggling a non-consequential setting.

**Not permitted, under any circumstance:**
- Confirming a hard-gated field (chemistry, model, condition)
- Committing a `battery_record`
- Generating a `shipping_paper` or `container_label`
- Correcting a storage-clock start date
- Any transition affected by a hard block

These wait for the server. **The user sees the truth, not a guess.** Every one of them produces a legal artifact or a legal state, and an optimistic render that later rolls back means someone has already acted on a document that does not exist.

### 6.5 Transitions

| Transition | Behaviour |
|---|---|
| List → detail | 200ms cross-fade; scroll position on the list is preserved on return |
| Step → step | 240ms horizontal slide on mobile, cross-fade on desktop |
| Dialog / Sheet open | 200ms scale-and-fade (Dialog) or slide-up (Sheet); focus moves to the first control; Escape closes; focus returns to the trigger |
| Toast | Slides in 200ms, out 150ms; stacks to a maximum of three, oldest dropping first |
| Badge status change | 120ms colour cross-fade. **No pulse, no flash, no attention-seeking loop** — a status that animates trains people to ignore it |
| Alert appearing | Height auto-animates over 200ms; content below reflows. `role="alert"` announces immediately. |
| Route guard denial | Immediate redirect, no intermediate flash, toast on arrival |

### 6.6 Focus and keyboard

- Focus moves to the `h1` on every route change so screen-reader users hear where they landed.
- Dialogs and Sheets trap focus and return it to the trigger on close.
- In the extraction review: Tab moves between rows, Enter confirms the focused row, `E` edits it, `⌘Enter` submits the step when the gate is satisfied.
- Every destructive action is reachable and confirmable by keyboard alone.
- Skip-to-content link as the first focusable element on every `(app)` route.

---

## 7. Build constraints for this spec

1. **Every screen reads through `src/data`** (`PROJECT_SETUP_BMMP.md` §3.2). No component imports Supabase. CI enforces it.
2. **The mock adapter must simulate latency and expose seeded failures**, or the loading and error states above are unreachable and will ship broken. Minimum seeded fixtures: a scuffed low-confidence label, an unreadable label, a catalog miss, a swollen pack, a recalled pack, an overdue container, an over-limit container, a site with no jurisdiction profile, an organization with no Terms of Service acceptance, a full-hazardous classification, **a container holding several unidentified records so §3.8b has something to show**, **open `alert` rows of each kind and target role**, a **second site in a different jurisdiction** so no screen can assume one org-wide profile, and a small mobility-scooter pack sitting beside a vehicle traction pack.
3. **`src/components/ui` is generated and not hand-edited.** Variants extend via `cva` in a sibling file.
4. **No business logic in a component.** Thresholds, tiers, classification and blocks come from `src/domain` and `BUSINESS_RULES.md`. A component renders a decision; it never makes one.
5. **No jurisdiction number, unit, deadline or citation is a literal anywhere in the UI.**
6. **No probability, percentage, likelihood or score of ignition, fire or thermal runaway — anywhere, in any phase, in any surface** (`_ANCHORS.md` §7.1).
7. **The hard gate on chemistry, model and condition has no bypass** — not by role, not by config, not by bulk action, not by keyboard shortcut.
7a. **`/review` ships as two compositions behind one route** (§3.8a, §3.8b), selected from the role→route capability map. Not one component with controls switched off. A capability map of booleans cannot express view-only and will be rewritten within a phase — use `none` / `read` / `write` (`SITE_ARCHITECTURE.md` §5.3).
7b. **Alerts are `alert` records, format bands are `format_classification` records.** No screen derives either on render, and no screen stores a format band on the battery.
8. **Every state in §2 and §5 is a testable state.** The Playwright suite covers each edge case in §5 against `DATA_ADAPTER=mock`, and the same suite must pass after the Supabase swap (`PROJECT_SETUP_BMMP.md` §5).

---

*Next Sketch LLC · Confidential · August 2026*
