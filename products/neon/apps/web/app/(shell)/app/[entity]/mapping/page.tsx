import { StubPage } from "@/components/stubs/StubPage";

export default function FieldMappingPage() {
    return <StubPage epic={5} title="Field Mapping" description="Configure field mapping for data import." route="/app/:entity/mapping" />;
}
