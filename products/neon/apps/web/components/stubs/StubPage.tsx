import { Badge } from "@/components/ui/badge";

interface StubPageProps {
    epic: number;
    title: string;
    description: string;
    route?: string;
}

/**
 * Reusable stub page component for routes that are planned but not yet implemented.
 * Shows the EPIC number, title, description, and optionally the route pattern.
 */
export function StubPage({ epic, title, description, route }: StubPageProps) {
    return (
        <div className="flex h-full min-h-[60vh] items-center justify-center">
            <div className="max-w-md space-y-4 text-center">
                <Badge variant="outline" className="text-xs">
                    EPIC {epic}
                </Badge>
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                <p className="text-sm text-muted-foreground">{description}</p>
                {route && (
                    <p className="font-mono text-xs text-muted-foreground/60">
                        {route}
                    </p>
                )}
                <div className="pt-2">
                    <span className="inline-block rounded-full bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
                        Coming Soon
                    </span>
                </div>
            </div>
        </div>
    );
}
