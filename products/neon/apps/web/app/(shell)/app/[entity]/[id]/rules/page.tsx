import { StubPage } from "@/components/stubs/StubPage";

export default function RulesPage() {
    return <StubPage epic={6} title="Rules" description="View business rules applied to this record." route="/app/:entity/:id/rules" />;
}
