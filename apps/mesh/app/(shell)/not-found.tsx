import { NotFoundBoundary } from "@athyper/platform-shell-app-foundation";

export default function ShellNotFound() {
  return <NotFoundBoundary applicationName="Athyper Mesh" surface="content" homeHref="/" homeLabel="Return to Mesh home" />;
}
