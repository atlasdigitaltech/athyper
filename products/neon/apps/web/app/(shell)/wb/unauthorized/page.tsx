import { ShieldOff } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
    return (
        <div className="flex h-dvh items-center justify-center">
            <div className="max-w-md space-y-6 text-center">
                <ShieldOff className="mx-auto size-12 text-muted-foreground" />
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold">Access Denied</h1>
                    <p className="text-sm text-muted-foreground">
                        Your account does not have an active subscription or has been
                        restricted from accessing this platform. Please contact your
                        administrator.
                    </p>
                </div>
                <div className="flex justify-center gap-3">
                    <Button variant="outline" asChild>
                        <Link href="/login">Sign In Again</Link>
                    </Button>
                    <Button variant="ghost" asChild>
                        <Link href="/">Go Home</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
