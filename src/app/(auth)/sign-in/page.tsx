import type { Metadata } from "next";
import Link from "next/link";

import { CARD_SPACING } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  isSessionEndReason,
  SESSION_END_MESSAGES,
} from "@/domain/access/denial";
import { safeNextPath } from "@/domain/access/next-path";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { data } from "@/data";
import { FormNotice } from "@/features/auth/components/form-messages";
import { DevSignInPanel } from "@/features/auth/components/dev-sign-in-panel";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { publicContext } from "@/lib/auth/session";

/**
 * `/sign-in` — `UX_SPEC.md` §3.1, `SITE_ARCHITECTURE.md` §5.6.
 *
 * Public. **A signed-in caller never reaches it** — `src/proxy.ts` redirects to
 * `/` on the presence of a session cookie, before this file runs, and that
 * decision is not duplicated here.
 *
 * Three query parameters, none of them trusted:
 *
 * - `next` — where to land afterwards, validated by `safeNextPath`. An
 *   unvalidated `?next=` on a compliance product's sign-in page is a
 *   credential-phishing primitive.
 * - `reason` — why a session ended, rendered from `SESSION_END_MESSAGES` and
 *   never restated here. Neither value names an account, an organization or a
 *   grant: the reader has proved nothing yet (Rule 1.2).
 * - `token` — an invitation being carried. The notice names **the inviting
 *   organization only** (§3.1): no role, no inviter, no counts.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/sign-in"],
};

function firstValue(
  value: string | string[] | undefined | null,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const params = await searchParams;

  const next = safeNextPath(firstValue(params.next));
  const reason = firstValue(params.reason);
  const rawToken = firstValue(params.token);

  // A token is only carried into the form when the invitation is live. Handing a
  // spent token to `signIn` would fail an otherwise good sign-in, and the reader
  // would have no way to tell which half went wrong.
  let invitedOrganizationName: string | null = null;
  if (rawToken !== null) {
    const pub = await publicContext();
    const invitation = await data.identity.readInvitation(pub, rawToken);
    if (invitation.state === "valid") {
      invitedOrganizationName = invitation.organizationName;
    }
  }
  const token = invitedOrganizationName === null ? null : rawToken;

  const signUpHref =
    token === null ? "/sign-up" : `/sign-up?token=${encodeURIComponent(token)}`;

  return (
    <div className="grid gap-4">
      {isSessionEndReason(reason) ? (
        <FormNotice
          headline={SESSION_END_MESSAGES[reason].headline}
          body={SESSION_END_MESSAGES[reason].body}
        />
      ) : null}

      {invitedOrganizationName === null ? null : (
        <FormNotice
          headline={`You've been invited to join ${invitedOrganizationName}.`}
          body="Sign in to accept."
        />
      )}

      <Card className={CARD_SPACING}>
        <CardHeader>
          {/*
            A real `h1`. `CardTitle` is a generated `div` and is never hand-edited,
            so the heading nests inside it — the front door of the product had no
            level-one heading at all, which is a screen-reader dead end.
          */}
          <CardTitle className="text-h2">
            <h1 id="page-title" tabIndex={-1}>
              {APP_ROUTE_NAMES["/sign-in"]}
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SignInForm next={next === "/" ? null : next} token={token} />

          {/*
            `UX_SPEC.md` §3.1 names a "Forgot password" link and no route on the
            fixed page list (`_ANCHORS.md` §5) serves it. Password reset belongs
            to the identity provider, which is mocked in B1a (D-39), so this
            states the absence rather than offering a link that 404s.
          */}
          <p className="text-caption text-muted-foreground">
            Forgot your password? Password reset arrives with the production
            identity provider — ask whoever set up your account.
          </p>

          <p className="text-body">
            Don&rsquo;t have an account?{" "}
            <Link
              href={signUpHref}
              data-inline-target="true"
              className="rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            >
              {APP_ROUTE_NAMES["/sign-up"]}
            </Link>
          </p>

          {/* A development shortcut past the sign-up screen. It renders only
              while the mock adapter is live, and it is not part of the product
              — see `dev-sign-in.ts`. */}
          <DevSignInPanel />
        </CardContent>
      </Card>
    </div>
  );
}
