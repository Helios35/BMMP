import type { Metadata } from "next";

import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import { data } from "@/data";
import { InvitationCard } from "@/features/auth/components/invitation-card";
import { publicContext, resolveRequestContext } from "@/lib/auth/session";

/**
 * `/invite/[token]` — `UX_SPEC.md` §3.3, Flow E, `SITE_ARCHITECTURE.md` §5.6.
 *
 * Public, and **exempt from the signed-in redirect** that sends a caller away
 * from `/sign-in` and `/sign-up`: a user may be invited to a second organization
 * while signed in to the first (Rule 1.5). `src/proxy.ts` already draws that
 * exemption; nothing here repeats it.
 *
 * **All five token states return HTTP 200.** A withdrawn, spent, expired or
 * unrecognised invitation is a state rather than an error, so none of them
 * reaches `notFound()` or the error boundary. Rendering a 404 for a spent token
 * would also answer, by its absence, whether the token ever existed.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES["/invite/[token]"],
};

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;

  const pub = await publicContext();
  // The token is the credential. `readInvitation` hashes it and returns one of
  // five states; only the `valid` arm carries anything belonging to a tenant.
  const invitation = await data.identity.readInvitation(pub, token);

  const resolution = await resolveRequestContext();

  return (
    <InvitationCard
      invitation={invitation}
      token={token}
      isSignedIn={resolution.kind === "resolved"}
    />
  );
}
