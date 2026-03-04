import { StubPage } from "@/components/stubs/StubPage";

export default function KanbanViewPage() {
    return <StubPage epic={5} title="Kanban View" description="Kanban board view for entity records." route="/app/:entity/view/kanban" />;
}
