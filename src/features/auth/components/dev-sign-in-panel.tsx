import type { ReactElement } from "react";
import { FlaskConical } from "lucide-react";

import { ACTION_BUTTON_CLASS, LeadingIcon } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEV_IDENTITIES,
  devIdentityLabel,
  isDevSignInAvailable,
} from "@/features/auth/dev-identities";
import { devSignIn } from "@/features/auth/dev-sign-in";

/**
 * **A development shortcut, and it is drawn so nobody mistakes it for one of the
 * product's own controls.**
 *
 * Nine fixture identities, one click each. It renders under the sign-in card's
 * *"Don't have an account? Sign up"* line and **only when the mock adapter is
 * live** — `resolveAdapter` refuses `DATA_ADAPTER=mock` under
 * `VERCEL_ENV=production` and throws rather than falling back (D-16), so *mock
 * is live* and *this is not production* are the same fact.
 *
 * The gate is checked here **and** inside the action. A control that is merely
 * not rendered is not a control that cannot be called.
 *
 * It carries the `attention` surface for the same reason `MockDataBanner` does:
 * a screen showing something that is not the real product says so, loudly, in
 * the one place a reader is already looking.
 *
 * **No button names an organisation.** `/sign-in` is public and a reader there
 * has proved nothing, so the page names no account, organisation or grant (Rule
 * 1.2). Each identity is described by the state it puts the product in instead,
 * which is what a reviewer wants anyway.
 */
export function DevSignInPanel(): ReactElement | null {
  if (!isDevSignInAvailable()) return null;

  return (
    <section
      data-dev-sign-in="true"
      aria-labelledby="dev-sign-in-heading"
      className={cn(
        "flex flex-col gap-3 rounded-md border p-4",
        INTENT_SURFACE_CLASSES.attention,
      )}
    >
      <div className="flex items-start gap-3">
        <LeadingIcon icon={FlaskConical} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="dev-sign-in-heading" className="text-body-strong">
            Development shortcut
          </h2>
          <p className="text-caption">
            Fake identities on fake data. This panel exists only while the mock
            adapter is live and is not part of the product.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {DEV_IDENTITIES.map((identity) => (
          <li key={identity.key}>
            <form action={devSignIn}>
              <input type="hidden" name="identity" value={identity.key} />
              <Button
                type="submit"
                variant="outline"
                size="lg"
                data-dev-sign-in-as={identity.key}
                className={cn(
                  ACTION_BUTTON_CLASS,
                  "h-auto w-full flex-col items-start gap-1 py-2 text-left whitespace-normal",
                )}
              >
                <span className="text-body-strong">
                  {identity.name} · {devIdentityLabel(identity)}
                </span>
                <span className="text-caption">{identity.scenario}</span>
              </Button>
            </form>
          </li>
        ))}
      </ul>

      <p className="text-caption">
        Or sign in above with any of those addresses and the password{" "}
        <span className="text-mono">bmmp-dev-password</span>.
      </p>
    </section>
  );
}
