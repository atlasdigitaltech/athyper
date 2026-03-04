import { StubPage } from "@/components/stubs/StubPage";

export default function TaskDetailPage() {
    return <StubPage epic={6} title="Task Detail" description="View and manage a specific task." route="/app/:entity/:id/tasks/:taskId" />;
}
