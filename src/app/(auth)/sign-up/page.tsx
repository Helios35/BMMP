import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { data } from "@/data";
import { FormNotice } from "@/features/auth/components/form-messages";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { publicContext } from "@/lib/auth/session";

/**
 * `/sign-up` — `UX_SPEC.md` §3.2, Rule 1.8.
 *
 * Public, and a signed-in caller never reaches it (`src/proxy.ts`).
 *
 * **Two ways in and no third** (Rule 1.8). Without a token this founds an
 * organization, and the person who does it becomes its first binding-authority
 * member (Rules 1.8, 7.3; D-35) — which is what makes the Terms of Service
 * acceptable at all thereafter. With a token it joins an existing organization at
 * the invited role, and the organization name is stated rather than typed.
 *
 * A token that will not resolve is sent to `/invite/[token]`, which is the one
 * screen that renders all five token states with a stated reason and a way
 * forward (§3.3). Falling through to a founding sign-up instead would quietly
 * create a second organization for someone who was invited to an existing one.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/sign-up"],
};

function firstValue(
  value: string | string[] | undefined | null,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SignUpPage({
  searchParams,
}: PageProps<"/sign-up">) {
  const params = await searchParams;
  const token = firstValue(params.token);

  let invitedEmail: string | null = null;
  let invitedOrganizationName: string | null = null;
  let invitedRoleLabel: string | null = null;

  if (token !== null) {
    const pub = await publicContext();
    const invitation = await data.identity.readInvitation(pub, token);
    if (invitation.state !== "valid") {
      redirect(`/invite/${encodeURIComponent(token)}`);
    }
    invitedEmail = invitation.invitedEmail;
    invitedOrganizationName = invitation.organizationName;
    invitedRoleLabel = ROLE_LABELS[invitation.role];
  }

  return (
    <div className="grid gap-4">
      {invitedOrganizationName === null ? null : (
        <FormNotice
          headline={`You've been invited to join ${invitedOrganizationName}.`}
          body={`Create your account to join as a ${invitedRoleLabel}.`}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-h2">
            {APP_ROUTE_NAMES["/sign-up"]}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SignUpForm
            token={token}
            invitedEmail={invitedEmail}
            invitedOrganizationName={invitedOrganizationName}
          />

          <p className="text-body">
            Already have an account?{" "}
            <Link
              href={
                token === null
                  ? "/sign-in"
                  : `/sign-in?token=${encodeURIComponent(token)}`
              }
              data-inline-target="true"
              className="rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            >
              {APP_ROUTE_NAMES["/sign-in"]}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
