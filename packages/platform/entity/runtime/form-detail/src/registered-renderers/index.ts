import { AddressEditor, AddressSummaryRenderer, ContactEditor, ContactSummaryRenderer } from "./contact-address";
export type SummaryRenderer = (props: { readonly data: unknown }) => React.ReactNode;
export const summaryRenderers: Readonly<Record<string, SummaryRenderer>> = Object.freeze({"platform.contact.summary.v1": ContactSummaryRenderer,"platform.address.summary.v1": AddressSummaryRenderer});
export const entityEditors = Object.freeze({"platform.contact.editor.v1": ContactEditor,"platform.address.editor.v1": AddressEditor});
export { AddressEditor, AddressSummaryRenderer, ContactEditor, ContactSummaryRenderer } from "./contact-address";
