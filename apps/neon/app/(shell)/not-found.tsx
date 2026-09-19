import { NotFoundBoundary } from "@athyper/platform-shell-app-foundation";

export default function ShellNotFound() {
  return <NotFoundBoundary applicationName="Athyper Neon" surface="content" homeHref="/home" homeLabel="Return to Neon home" />;
}
