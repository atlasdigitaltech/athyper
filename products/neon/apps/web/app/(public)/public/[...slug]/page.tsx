interface PublicPageProps {
    params: Promise<{ slug: string[] }>;
}

export default async function PublicCatchAllPage({ params }: PublicPageProps) {
    const { slug } = await params;
    const path = slug.join("/");

    return (
        <div className="flex h-dvh items-center justify-center">
            <div className="max-w-md space-y-4 text-center">
                <h1 className="text-2xl font-semibold">Public Page</h1>
                <p className="text-sm text-muted-foreground">
                    /{path}
                </p>
                <p className="text-xs text-muted-foreground/60">
                    This public page is a placeholder. Add content for docs, pricing, or status pages.
                </p>
            </div>
        </div>
    );
}
