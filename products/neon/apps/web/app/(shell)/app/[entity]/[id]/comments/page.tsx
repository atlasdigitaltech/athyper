import { CommentList } from "@/components/collab";

interface CommentsPageProps {
    params: Promise<{ entity: string; id: string }>;
}

export default async function CommentsPage({ params }: CommentsPageProps) {
    const { entity, id } = await params;

    return (
        <div className="mx-auto max-w-3xl p-6">
            <h1 className="mb-6 text-2xl font-semibold tracking-tight">Comments</h1>
            <CommentList entityType={entity} entityId={id} />
        </div>
    );
}
