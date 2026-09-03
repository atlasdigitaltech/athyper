import { AppLoadingBoundary } from "@athyper/platform-shell-app-foundation";
import { cookies } from "next/headers";
export default async function Loading() { const collapsed=(await cookies()).get("athyper_shell_collapsed")?.value==="true"; return <AppLoadingBoundary kind="bootstrap" label="Loading Athyper Neon" collapsed={collapsed} applicationName="Neon" planeDescriptor="Business Operating Platform" planeIconSrc="/brand/neon/app-icon.png" planeWordmarkSrc="/brand/neon/identity-lockup.svg" persistentDesktopBrand />; }
