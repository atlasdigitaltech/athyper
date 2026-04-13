/**
 * /module/[code] — Module landing page
 *
 * Redirects to the module's primary navigable page using the MODULE_PAGES
 * static map. This route is the target when a user clicks a module item in
 * the ContextPanel accordion.
 *
 * Examples:
 *   /module/acc  → /app/invoice  (first non-"Saved views" page of ACC)
 *   /module/buy  → /app/purchase-requisition
 *   /module/meta → /setup/metadata
 *
 * Falls back to /dashboard if the module code is unknown.
 */

import { redirect, notFound } from "next/navigation";
import { getModulePrimaryHref, MODULE_PAGES } from "@athyper/navigation";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function ModuleLandingPage({ params }: Props) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  if (!MODULE_PAGES[upperCode]) {
    notFound();
  }

  redirect(getModulePrimaryHref(upperCode));
}
