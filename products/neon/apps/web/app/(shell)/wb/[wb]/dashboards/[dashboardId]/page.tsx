import { StubPage } from "@/components/stubs/StubPage";

export default function DashboardViewerPage() {
    return <StubPage epic={4} title="Dashboard Viewer" description="View a dashboard with its configured widgets and layout." route="/wb/:wb/dashboards/:id" />;
}
