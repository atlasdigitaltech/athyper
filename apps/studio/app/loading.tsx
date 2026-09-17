import { ApplicationLoading } from "@athyper/platform-shell-app-foundation";
import { cookies } from "next/headers";

export default async function Loading() {
  const collapsed = (await cookies()).get("athyper_shell_collapsed")?.value === "true";
  return <ApplicationLoading plane="studio" collapsed={collapsed} />;
}
