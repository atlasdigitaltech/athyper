import { ApprovalCommentPanel } from "@/components/collab";

interface ApprovalsPageProps {
    params: Promise<{ entity: string; id: string }>;
}

export default async function ApprovalsPage({ params }: ApprovalsPageProps) {
    const { id } = await params;

    return (
        <div className="mx-auto max-w-3xl p-6">
            <h1 className="mb-6 text-2xl font-semibold tracking-tight">Approval Comments</h1>
            <ApprovalCommentPanel instanceId={id} />
        </div>
    );
}
