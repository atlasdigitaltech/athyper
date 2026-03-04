import { redirect } from "next/navigation";

interface EntityPageProps {
    params: Promise<{ entity: string }>;
}

/**
 * Default entity page — redirects to /app/:entity/view/list
 */
export default async function EntityDefaultPage({ params }: EntityPageProps) {
    const { entity } = await params;
    redirect(`/app/${entity}/view/list`);
}
