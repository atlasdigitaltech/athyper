import { StubPage } from "@/components/stubs/StubPage";

export default function KanbanBoardPage() {
    return <StubPage epic={5} title="Kanban Board" description="View a specific kanban board configuration." route="/app/:entity/view/kanban/:key" />;
}
