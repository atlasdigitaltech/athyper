import { NotFoundBoundary } from "@athyper/platform-shell-app-foundation";

export default function MdgUnknownRoute() {
  return <NotFoundBoundary applicationName="Athyper Studio" surface="content" homeHref="/mdg" homeLabel="Return to Master Data Governance" />;
}
