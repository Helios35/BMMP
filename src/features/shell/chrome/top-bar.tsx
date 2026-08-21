import { CommandPaletteTrigger } from "@/features/shell/command-palette/command-palette-trigger";

import { AlertBell, type AlertBellProps } from "./alert-bell";
import {
  OrganizationSwitcher,
  type OrganizationSwitcherProps,
} from "./organization-switcher";
import { UserMenu, type UserMenuProps } from "./user-menu";

/**
 * The top bar — `SITE_ARCHITECTURE.md` §2.4's global chrome, present on every
 * `(app)` route.
 *
 * A server component that places four client islands: the organisation
 * switcher, the command-palette trigger, the alert bell and the user menu.
 * Everything each of them needs was resolved before rendering — a role, a
 * capability or a `RequestContext` never crosses into the browser (§5.3(3)).
 *
 * The **More** trigger is not here: on mobile it is slot 5 of the tab bar, which
 * is where a thumb already is.
 */

export interface TopBarProps {
  readonly organizationSwitcher: Omit<OrganizationSwitcherProps, "variant">;
  readonly alertBell: AlertBellProps;
  readonly userMenu: UserMenuProps;
}

export function TopBar({
  organizationSwitcher,
  alertBell,
  userMenu,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-border bg-background px-4 md:min-h-16 md:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <OrganizationSwitcher {...organizationSwitcher} variant="top-bar" />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <CommandPaletteTrigger />
        <AlertBell {...alertBell} />
        <UserMenu {...userMenu} />
      </div>
    </header>
  );
}
