/**
 * Shared app components — used in two or more places (`PROJECT_SETUP_BMMP.md`
 * §3.3). A component used in one place lives in that `features/<feature>/`
 * folder instead.
 *
 * `src/components/ui/` holds the shadcn/ui primitives. **Generated — do not
 * hand-edit** (§3.1). Variants live in a sibling file per component using `cva`,
 * never by editing the generated primitive (`UX_SPEC.md` §1.1).
 */

export * from "./status/status-intent";
export * from "./status/intent-classes";
export * from "./status/intent-icons";
export * from "./status/status-badge";
export * from "./confidence/confidence-band-display";
export * from "./alert/alert-card";
export * from "./theme/theme-provider";
export * from "./record-table/list-url";
export * from "./record-table/record-table";
export * from "./storage/storage-clock-meter";
export * from "./access/read-only-banner";
export * from "./access/gated-control";
export * from "./provenance/field-source-badge";
