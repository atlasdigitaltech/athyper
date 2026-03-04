import { StubPage } from "@/components/stubs/StubPage";

export default function IntegrationsPage() {
    return (
        <StubPage
            epic={10}
            title="Integration Mappings"
            description="Configure entity-level integration endpoints, field mappings, sync schedules, and transformation rules."
            route="/wb/:wb/mesh/meta-studio/:entity/integrations"
        />
    );
}
