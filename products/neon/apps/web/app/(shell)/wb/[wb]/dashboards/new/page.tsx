import { StubPage } from "@/components/stubs/StubPage";

export default function CreateDashboardPage() {
    return <StubPage epic={4} title="Create Dashboard" description="Create a new dashboard with scope and widget configuration." route="/wb/:wb/dashboards/new" />;
}
