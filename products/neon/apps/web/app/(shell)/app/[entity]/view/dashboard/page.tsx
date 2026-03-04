import { StubPage } from "@/components/stubs/StubPage";

export default function EntityDashboardPage() {
    return <StubPage epic={5} title="Entity Dashboard" description="Dashboard view for entity analytics." route="/app/:entity/view/dashboard" />;
}
