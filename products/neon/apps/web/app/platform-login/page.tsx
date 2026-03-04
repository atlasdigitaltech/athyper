/**
 * Platform Admin Login Page
 *
 * Entry point for athyper product administrators to log in
 * via the platform-control Keycloak realm.
 */
export default function PlatformLoginPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="w-full max-w-sm rounded-lg border bg-white p-8 shadow-sm">
                <h1 className="text-xl font-semibold text-center mb-2">
                    athyper Platform Admin
                </h1>
                <p className="text-sm text-gray-500 text-center mb-6">
                    Sign in with your platform administrator credentials.
                </p>
                <a
                    href="/api/auth/platform-login?workbench=admin"
                    className="block w-full rounded-md bg-amber-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                >
                    Sign in to Platform Control
                </a>
                <p className="mt-4 text-xs text-gray-400 text-center">
                    This login is for athyper staff only. Tenant users should use the
                    regular login page.
                </p>
            </div>
        </div>
    );
}
