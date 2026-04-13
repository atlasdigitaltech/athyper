/**
 * /core/[code] — Core module landing page
 *
 * Redirects to the core module's primary page using MODULE_PAGES.
 * This route is reached when a user clicks a module in the Core
 * ContextPanel (isPlatform = true).
 *
 * Examples:
 *   /core/meta → /setup/metadata
 *   /core/iam  → /app/principal
 *   /core/fnd  → /setup/tenant
 */

import { redirect, notFound } from "next/navigation";
import { getModulePrimaryHref, MODULE_PAGES } from "@athyper/navigation";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function CoreModuleLandingPage({ params }: Props) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  if (!MODULE_PAGES[upperCode]) {
    notFound();
  }

  redirect(getModulePrimaryHref(upperCode));
}
