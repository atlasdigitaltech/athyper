export const dynamic = "force-dynamic";

export default function HealthPage() {
    return (
        <div className="flex h-dvh items-center justify-center">
            <pre className="rounded-lg border bg-card p-6 text-sm">
                {JSON.stringify(
                    {
                        status: "ok",
                        timestamp: new Date().toISOString(),
                        version: "1.0.0",
                    },
                    null,
                    2,
                )}
            </pre>
        </div>
    );
}
