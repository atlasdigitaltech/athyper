import { StubPage } from "@/components/stubs/StubPage";

export default function GatewayPage() {
    return (
        <StubPage
            epic={9}
            title="Gateway Management"
            description="Configure Traefik routes, middleware chains, TLS certificates, rate limiting, and load balancing rules."
            route="/wb/:wb/mesh/ops/gateway"
        />
    );
}
