import { StubPage } from "@/components/stubs/StubPage";

export default function IAMPage() {
    return (
        <StubPage
            epic={9}
            title="Identity & Access Management"
            description="Manage Keycloak realms, clients, identity providers, user federation, and authentication flows."
            route="/wb/:wb/mesh/ops/iam"
        />
    );
}
