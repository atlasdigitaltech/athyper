# Shared entity form framework

New Request uses the shared form-detail package for navigation and editing. The 360 record view uses the same section navigation and scroll hook.

## Composition

- `EntityFormLayout` supplies a two-column layout, optional header/footer slots, responsive navigation, and validation indicators. Its mode (`create`, `amend`, `review`, or `view`) describes presentation; it does not grant permissions or choose a field renderer.
- `EntitySectionNavigation` renders section links and the mobile selector.
- `useEntitySectionScroll` tracks the visible section without moving focus. Explicit navigation scrolls and focuses the target, and holds that position while lazy content changes height until the user interacts.
- `EntityDataSurface` accepts optional `sectionNavigation: { label, mode }`. Visible sections, labels, ordering and collection counts come from the supplied Meta Entity surface and answers. Nested editors retain their existing layout.
- `AddressesSection`, `ContactsSection`, `BankAccountsSection`, `CertificationsSection`, and `SupportingDocumentsSection` continue to share collection editing, summaries, counts, validation and confirmation behavior.

## Workflow ownership

The business-partner adapter enables navigation for the Details surface. It retains ownership of permissions, attachments, draft persistence, protected-value capture, submission, and the Partner / Details / Review workflow. Navigation does not unmount visible editors or save data. Hidden sections follow the existing metadata visibility rules.

The existing 360 adapter retains authorization, section providers, tabs, URL navigation and its optional sidebar. Review and Amend can adopt the layout with their own renderers and actions; they are not migrated by this first delivery.

## Verification

Browser tests cover form scroll tracking, explicit navigation, focus preservation, validation indicators, mobile selection, record tab switching and lazy sections. DEV probes exercise the new request layout and the five country-specific bank formats without creating cases.
