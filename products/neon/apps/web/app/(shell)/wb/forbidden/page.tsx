import { Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
    return (
        <div className="flex h-dvh items-center justify-center">
            <div className="max-w-md space-y-6 text-center">
                <Lock className="mx-auto size-12 text-muted-foreground" />
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold">Forbidden</h1>
                    <p className="text-sm text-muted-foreground">
                        You do not have the required permissions to access this resource.
                        If you believe this is an error, please contact your administrator.
                    </p>
                </div>
                <div className="flex justify-center gap-3">
                    <Button variant="outline" asChild>
                        <Link href="/wb/home">Go to Workbench</Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/">Go Home</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
