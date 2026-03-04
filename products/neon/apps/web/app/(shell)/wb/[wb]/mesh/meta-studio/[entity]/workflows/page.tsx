import { StubPage } from "@/components/stubs/StubPage";

export default function WorkflowsPage() {
    return (
        <StubPage
            epic={7}
            title="Workflow Designer"
            description="Design approval workflows, multi-stage routing rules, SLA policies, and escalation chains for this entity."
            route="/wb/:wb/mesh/meta-studio/:entity/workflows"
        />
    );
}
