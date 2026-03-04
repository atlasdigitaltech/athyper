import { StubPage } from "@/components/stubs/StubPage";

export default function ValidatePage() {
    return <StubPage epic={6} title="Validate" description="Run validation rules on this record." route="/app/:entity/:id/validate" />;
}
