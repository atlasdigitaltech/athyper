import { StubPage } from "@/components/stubs/StubPage";

export default function DashboardPermissionsPage() {
    return <StubPage epic={4} title="Dashboard Permissions" description="Manage dashboard sharing and access permissions." route="/wb/:wb/dashboards/:id/permissions" />;
}
