import { StubPage } from "@/components/stubs/StubPage";

export default function TasksPage() {
    return <StubPage epic={6} title="Tasks" description="Manage tasks associated with this record." route="/app/:entity/:id/tasks" />;
}
