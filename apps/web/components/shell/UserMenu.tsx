"use client";

/**
 * UserMenu — compact avatar in the topbar.
 * Clicking navigates directly to /settings.
 */

import Link from "next/link";
import { useShellSession } from "@/components/providers/SessionProvider";
import { useIntl } from "@/components/providers/IntlProvider";

export function UserMenu() {
  const { bff } = useShellSession();
  const { formatMessage } = useIntl();

  const initials = bff.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join("");

  return (
    <Link
      href="/settings"
      aria-label={formatMessage({ id: "shell.userMenu.label" }) as string}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-doc-subtitle font-semibold text-background outline-none transition-all hover:opacity-80"
    >
      {initials}
    </Link>
  );
}
