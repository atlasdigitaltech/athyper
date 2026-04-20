import { redirect } from "next/navigation";

/**
 * /select — redirects to the canonical /auth/select page, forwarding all
 * query params (returnUrl, filter, etc.) so deep-link context is preserved.
 */
export default async function SelectRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  redirect(qs ? `/auth/select?${qs}` : "/auth/select");
}
