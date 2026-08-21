import Link from "next/link";
import { CircleAlert } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readableRoutesFor } from "@/domain/access/route-capability";
import {
  APP_ROUTE_NAMES,
  type AppRoute,
  isPublicRoute,
} from "@/domain/access/routes";
import { ROLE_LABELS, type RoleCode } from "@/domain/taxonomy/role";
import type { InvitationView, UnusableInvitationState } from "@/data/contracts";
import { cn } from "@/lib/utils";

import { AcceptInvitationButton } from "./accept-invitation-button";

/**
 * `/invite/[token]` — `UX_SPEC.md` §3.3, Flow E.
 *
 * **It never shows tenant data before authentication.** The organization name,
 * the role in plain language and the inviter, and nothing else, ever — no record
 * counts, no site list, no member list, no address. That is enforced by the
 * contract rather than by this file: `UnusableInvitation` carries a state and
 * nothing more, so a withdrawn, spent, expired or unrecognised token hands its
 * holder no tenant field a screen could leak (Rule 1.2).
 *
 * **All five states are a 200.** A spent invitation is a state, not an error, and
 * each gets a stated reason and a way forward rather than a raw error page.
 */

const HOW_MANY_DESTINATIONS_NAMED = 5;

/**
 * The routes worth naming to someone deciding whether to accept — every route
 * this role can **open**, from the same capability map the guard reads.
 *
 * The two exclusions are presentation, not access: a dynamic segment has no
 * standalone destination to name ("Battery record" is not somewhere you go), and
 * an action page like `/batteries/new` is a thing you do rather than a place the
 * navigation offers. **Neither decides anything** — the list is
 * `readableRoutesFor(role)` filtered, so it cannot disagree with the guard about
 * what this role reaches (`SITE_ARCHITECTURE.md` §7.2).
 */
function destinationRoutesFor(role: RoleCode): readonly AppRoute[] {
  return readableRoutesFor(role).filter(
    (route) =>
      !isPublicRoute(route) && !route.includes("[") && !route.endsWith("/new"),
  );
}

/**
 * "You'll be able to open: Dashboard, Batteries, Containers, and more."
 *
 * Built from `APP_ROUTE_NAMES` rather than written by hand, because a
 * description of a role that is typed out is a description that drifts from what
 * the role can actually reach the first time the map changes.
 */
function describeRole(role: RoleCode): string | null {
  const routes = destinationRoutesFor(role);
  if (routes.length === 0) return null;
  const named = routes
    .slice(0, HOW_MANY_DESTINATIONS_NAMED)
    .map((route) => APP_ROUTE_NAMES[route]);
  const suffix =
    routes.length > HOW_MANY_DESTINATIONS_NAMED ? ", and more" : "";
  return `You'll be able to open: ${named.join(", ")}${suffix}.`;
}

/**
 * Rules 1.9, 1.10 — **only P2 and P6 may invite, revoke or re-issue.** Every
 * remedy names those two, and it names them through `ROLE_LABELS`: a T-37 label
 * written inline is a defect even when it happens to match
 * (`TAXONOMY.md` §5.3).
 */
const ASK_TO_REISSUE = `Ask a ${ROLE_LABELS.facility_manager} or a ${ROLE_LABELS.platform_admin} to send a new one.`;

interface UnusableCopy {
  readonly headline: string;
  readonly body: string;
  readonly offersSignIn: boolean;
}

/**
 * The four states that cannot be accepted, and what each one says.
 *
 * **`unknown` discloses nothing** — it reads identically for a well-formed token
 * that has never existed and for a string of gibberish, which is why it names no
 * organization and offers no lookup (Rule 1.2).
 *
 * Precedence between them belongs to the adapter (`revoked` → `used` →
 * `expired` → `unknown`); this record only renders whichever arrived.
 */
const UNUSABLE_COPY: Readonly<Record<UnusableInvitationState, UnusableCopy>> = {
  revoked: {
    headline: "This invitation was withdrawn.",
    body: ASK_TO_REISSUE,
    offersSignIn: false,
  },
  used: {
    headline: "This invitation has already been used.",
    body: "If this was you, sign in instead.",
    offersSignIn: true,
  },
  expired: {
    headline: "This invitation has expired.",
    body: `Invitations are valid for a limited window. ${ASK_TO_REISSUE}`,
    offersSignIn: false,
  },
  unknown: {
    headline: "This invitation link isn't valid.",
    body: `Check the link in your email. ${ASK_TO_REISSUE}`,
    offersSignIn: false,
  },
};

export interface InvitationCardProps {
  readonly invitation: InvitationView;
  /** The raw token, carried to `/sign-up`, to `/sign-in` or to the accept action. */
  readonly token: string;
  /**
   * Rule 1.5 — a user may be invited to a **second** organization while signed
   * in to the first, which is why `src/proxy.ts` exempts this route from the
   * signed-in redirect. A signed-in reader gets the Server Action; an anonymous
   * one gets Flow E step 2's link.
   */
  readonly isSignedIn: boolean;
}

export function InvitationCard({
  invitation,
  token,
  isSignedIn,
}: InvitationCardProps) {
  if (invitation.state !== "valid") {
    return <UnusableInvitationCard state={invitation.state} />;
  }

  const roleLabel = ROLE_LABELS[invitation.role];
  const description = describeRole(invitation.role);
  const headline =
    invitation.invitedByName === null
      ? `You've been invited to join ${invitation.organizationName}.`
      : `${invitation.invitedByName} invited you to join ${invitation.organizationName}.`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h2">{headline}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="flex flex-wrap items-center gap-2 text-body">
          You&rsquo;ll join as{" "}
          <Badge variant="outline" className="h-auto px-2 py-1 text-label">
            {roleLabel}
          </Badge>
        </p>
        {description === null ? null : (
          <p className="max-w-[72ch] text-body text-muted-foreground">
            {description}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {isSignedIn ? (
            <AcceptInvitationButton token={token} />
          ) : (
            <Button asChild size="lg" className="h-12 w-full">
              <Link
                href={
                  invitation.requiresAccount
                    ? `/sign-up?token=${encodeURIComponent(token)}`
                    : `/sign-in?token=${encodeURIComponent(token)}`
                }
              >
                Accept invitation
              </Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="lg" className="h-12 w-full">
            <Link href="/sign-in">Not now</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A token that cannot be accepted — an `attention` intent and **not `critical`.**
 *
 * Nothing has failed and nothing is wrong: the link is spent. `critical` red is
 * reserved for an overdue clock, a damaged or recalled battery, a hard
 * compliance block and a destructive confirmation (`UX_SPEC.md` §1.2 Rule 5),
 * and spending it here trains people to discount it where it matters.
 */
function UnusableInvitationCard({
  state,
}: {
  readonly state: UnusableInvitationState;
}) {
  const copy = UNUSABLE_COPY[state];

  return (
    <Card>
      <CardContent className="grid gap-4 pt-6">
        <Alert
          className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2 px-4 py-4")}
          role="status"
          data-invitation-state={state}
        >
          <CircleAlert aria-hidden="true" className="size-5" />
          <AlertTitle className="text-body-strong">{copy.headline}</AlertTitle>
          <AlertDescription className="max-w-[72ch] text-body text-current">
            {copy.body}
          </AlertDescription>
        </Alert>

        <div className="grid gap-1">
          {/*
            "Request a new invitation" is an instruction rather than a control,
            and deliberately. `UnusableInvitation` carries no organization, no
            inviter and no address — that absence is what stops a spent token
            disclosing a tenant (Rule 1.2) — so there is nobody for a button to
            write to and nothing for it to create in this unit. A button that
            did nothing would be worse than the sentence that says who to ask.
          */}
          <p className="text-body-strong">Request a new invitation</p>
          <p className="max-w-[72ch] text-body text-muted-foreground">
            {ASK_TO_REISSUE}
          </p>
        </div>

        <Button
          asChild
          variant={copy.offersSignIn ? "default" : "outline"}
          size="lg"
          className="h-12 w-full sm:w-auto sm:self-start sm:px-6"
        >
          <Link href="/sign-in">{APP_ROUTE_NAMES["/sign-in"]}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
