import { StubPage } from "@/components/stubs/StubPage";

export default function WorkflowPage() {
    return <StubPage epic={6} title="Workflow" description="View workflow status, steps, and history." route="/app/:entity/:id/workflow" />;
}
