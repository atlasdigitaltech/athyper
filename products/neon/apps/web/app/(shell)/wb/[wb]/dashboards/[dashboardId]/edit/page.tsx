import { StubPage } from "@/components/stubs/StubPage";

export default function DashboardEditorPage() {
    return <StubPage epic={4} title="Dashboard Editor" description="Edit dashboard layout, widgets, and configuration." route="/wb/:wb/dashboards/:id/edit" />;
}
