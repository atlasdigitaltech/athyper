"use client";

/**
 * UserMenu — compact avatar in the topbar.
 * Clicking navigates directly to /settings.
 */

import Link from "next/link";
import { useShellSession } from "@/components/providers/SessionProvider";

export function UserMenu() {
  const { bff } = useShellSession();

  const initials = bff.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join("");

  return (
    <Link
      href="/settings"
      aria-label="Profile &amp; Settings"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-doc-subtitle font-semibold text-background outline-none transition-all hover:opacity-80"
    >
      {initials}
    </Link>
  );
}
