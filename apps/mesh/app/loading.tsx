import { AppLoadingBoundary } from "@athyper/platform-shell-app-foundation";
import { cookies } from "next/headers";
export default async function Loading() { const collapsed=(await cookies()).get("athyper_shell_collapsed")?.value==="true"; return <AppLoadingBoundary kind="bootstrap" label="Loading Athyper Mesh" collapsed={collapsed} applicationName="Mesh" planeDescriptor="Business Collaboration Network" planeIconSrc="/brand/mesh/app-icon.png" planeWordmarkSrc="/brand/mesh/identity-lockup.svg" />; }
