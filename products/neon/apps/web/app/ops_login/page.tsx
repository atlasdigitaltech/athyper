import { Command, Settings } from "lucide-react";

const BRAND = { bg: "#d97706", light: "#fef3c7" };

/**
 * OPS Admin Login Page
 *
 * Entry point for athyper platform administrators.
 * Authenticates via the platform-control Keycloak realm.
 * After login, redirects to /platform for tenant selection,
 * then the admin chooses which workbench (user/admin/partner) to operate in.
 */
export default function OpsLoginPage() {
    return (
        <div className="flex min-h-dvh">
            {/* Left branding panel */}
            <div
                className="hidden lg:flex lg:w-1/3 items-center justify-center"
                style={{ backgroundColor: BRAND.bg }}
            >
                <div className="space-y-6 text-center p-12">
                    <Settings className="mx-auto size-12" style={{ color: "#fff" }} />
                    <div className="space-y-2">
                        <h1 className="font-light text-4xl" style={{ color: "#fff" }}>
                            OPS Admin
                        </h1>
                        <p className="text-lg" style={{ color: BRAND.light }}>
                            Platform operations control
                        </p>
                    </div>
                </div>
            </div>

            {/* Right login panel */}
            <div className="flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
                <div className="w-full max-w-sm space-y-8">
                    <div className="space-y-2 text-center">
                        <div className="flex items-center justify-center gap-2 lg:hidden">
                            <Command className="size-6" />
                            <span className="text-lg font-semibold">Neon</span>
                        </div>
                        <h2 className="text-2xl font-medium tracking-tight">OPS Admin Sign In</h2>
                        <p className="text-sm text-muted-foreground">
                            Sign in with your platform administrator credentials.
                            After login you will select a tenant and workbench.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <a
                            href="/api/auth/platform-login?workbench=admin"
                            className="block w-full rounded-lg px-4 py-3 text-center text-sm font-medium transition-colors"
                            style={{ backgroundColor: BRAND.bg, color: "#fff" }}
                        >
                            Sign in to Platform Control
                        </a>
                        <a
                            href="/"
                            className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Back to login options
                        </a>
                    </div>

                    <p className="text-center text-xs text-muted-foreground">
                        This login is for athyper staff only. Tenant users should use
                        the User, Admin, or Partner login.
                    </p>

                    <p className="text-center text-xs text-muted-foreground">
                        &copy; {new Date().getFullYear()} athyper. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
}
