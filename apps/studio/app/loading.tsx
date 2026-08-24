import { AppLoadingBoundary } from "@athyper/platform-shell-app-foundation";
import { cookies } from "next/headers";
export default async function Loading() { const collapsed=(await cookies()).get("athyper_shell_collapsed")?.value==="true"; return <AppLoadingBoundary kind="bootstrap" label="Loading Athyper Studio" collapsed={collapsed} applicationName="Studio" planeDescriptor="Business Technology Platform" planeIconSrc="/brand/studio/app-icon.png" planeWordmarkSrc="/brand/studio/identity-lockup.svg" />; }
