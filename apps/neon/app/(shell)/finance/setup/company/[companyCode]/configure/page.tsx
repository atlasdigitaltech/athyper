import { redirect } from "next/navigation";
import { ConfigureWorkspaceView } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";

type ConfigureTab = "gl_controls" | "chart_assignment" | "book_assignment" | "house_banks";

const VALID_TABS: readonly ConfigureTab[] = ["gl_controls", "chart_assignment", "book_assignment", "house_banks"];

function coerceTab(value: string | string[] | undefined): ConfigureTab | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  return (VALID_TABS as readonly string[]).includes(raw) ? raw as ConfigureTab : undefined;
}

export default async function FinanceSetupConfigureRoute({
  params,
  searchParams,
}: {
  params:       Promise<{ companyCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ companyCode }, sp] = await Promise.all([params, searchParams]);
  const session = await getNeonServerSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/finance/setup/company/${companyCode}/configure`)}`);
  }
  return (
    <ConfigureWorkspaceView
      companyCode={decodeURIComponent(companyCode)}
      initialTab={coerceTab(sp["tab"])}
    />
  );
}
