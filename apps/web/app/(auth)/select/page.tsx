import { redirect } from "next/navigation";

/**
 * /select — redirects to the canonical /auth/select page.
 *
 * This route group file is kept to avoid 404s if anything links here,
 * but the auth flow uses /auth/select as its canonical URL.
 */
export default function SelectRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  void searchParams; // not needed — redirect preserves query string via the link
  redirect("/auth/select");
}
