import { redirect } from "next/navigation";

const LEGACY: Record<string, string> = {
  profile: "profile",
  identity: "identity",
  security: "identity",
  preferences: "preferences",
  notifications: "notifications",
  "tenant-context": "context",
};

export default async function SettingsRoute({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  redirect(`/settings/personal/${LEGACY[section ?? ""] ?? "profile"}`);
}
