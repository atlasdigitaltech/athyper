import { NotFoundBoundary } from "@athyper/platform-shell-app-foundation";

export default function ShellNotFound() {
  return <NotFoundBoundary applicationName="Athyper Studio" surface="content" homeHref="/" homeLabel="Return to Studio home" />;
}
