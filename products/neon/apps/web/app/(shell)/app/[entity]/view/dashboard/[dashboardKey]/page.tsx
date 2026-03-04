import { StubPage } from "@/components/stubs/StubPage";

export default function DashboardViewPage() {
    return <StubPage epic={5} title="Dashboard View" description="View a specific entity dashboard." route="/app/:entity/view/dashboard/:key" />;
}
