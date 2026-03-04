# Shared Packages

Reference for the 9 shared packages in `packages/`. These are consumed by `products/neon` and by each other — never by `framework/`.

## Package Map

```
packages/
├── api-client       @athyper/api-client      HTTP client for backend APIs
├── auth             @athyper/auth             Auth types and Keycloak helpers
├── dashboard        @athyper/dashboard        Dashboard schema, resolution, registry
├── i18n             @athyper/i18n             Internationalization (7 locales)
├── theme            @athyper/theme            Design tokens + Tailwind preset
├── ui               @athyper/ui              React component library
├── workbench-admin  @athyper/workbench-admin  Admin workbench module definitions
├── workbench-partner @athyper/workbench-partner Partner workbench module definitions
└── workbench-user   @athyper/workbench-user   User workbench module definitions
```

---

## `@athyper/api-client`

HTTP client library that wraps `fetch` calls to backend API routes. Used by React hooks in the product layer.

### Modules

| Module | Exports | Purpose |
|--------|---------|---------|
| `content/` | `contentClient` | Upload, download, link, unlink, ACL, versions, multipart, preview |
| `messaging/` | `messagingClient` | Conversations CRUD, messages, search, thread replies, streaming |
| `notifications/` | `notificationClient` | List notifications, mark read/all-read, unread count, streaming |

### Usage Pattern

```typescript
import { contentClient } from "@athyper/api-client";

const { uploadUrl } = await contentClient.initiateUpload({
  fileName: "report.pdf",
  contentType: "application/pdf",
  entityType: "order",
  entityId: "ord-123",
});
```

---

## `@athyper/auth`

Auth types and Keycloak helpers shared between the product's BFF layer and client components.

### Exports

| Export | Purpose |
|--------|---------|
| `KeycloakTokenClaims` | Token claim types (realm_access, resource_access, etc.) |
| `Session` | Session type (userId, tenantId, roles, expiry) |
| `AuthConfig` | Keycloak connection configuration |

---

## `@athyper/dashboard`

Dashboard framework — schema definitions, contribution registry, and layout resolution engine.

### Modules

| Module | Purpose |
|--------|---------|
| `schemas/` | Zod schemas for `dashboard.contribution.json`, layout definitions, widget parameter types |
| `registry/` | Contribution registry — collects and indexes dashboard contributions from all modules |
| `resolution/` | Layout resolver — merges contributions into renderable dashboard layouts |
| `types/` | TypeScript types for widgets, layouts, contributions |

### Dashboard Contribution Format

Each business module can contribute dashboards via `dashboard.contribution.json`:

```json
{
  "module": "finance.accounting",
  "dashboards": [
    {
      "id": "accounting-overview",
      "title": "Accounting Overview",
      "widgets": [
        { "type": "kpi", "params": { "metric": "revenue" } },
        { "type": "chart", "params": { "chartType": "line", "dataSource": "gl-balance" } }
      ]
    }
  ]
}
```

---

## `@athyper/i18n`

Internationalization package with 7 locale bundles.

### Supported Locales

| Code | Language |
|------|----------|
| `en` | English |
| `ar` | Arabic |
| `de` | German |
| `fr` | French |
| `hi` | Hindi |
| `ms` | Malay |
| `ta` | Tamil |

### File Structure

```
i18n/
├── src/index.ts          i18n initialization and helpers
└── lang/
    ├── en/
    │   ├── common.json       Common UI strings
    │   └── dashboard/        Dashboard-specific strings
    ├── ar/
    │   ├── common.json
    │   └── dashboard/
    └── ... (de, fr, hi, ms, ta)
```

### Build Note

JSON files are bundled into `dist/` by tsup. After editing any `lang/**/*.json` file, rebuild:

```bash
cd packages/i18n && npx tsup src/index.ts --format esm --dts --sourcemap --outDir dist
```

---

## `@athyper/theme`

Design tokens and Tailwind CSS preset for consistent styling.

### Exports

| Export | Purpose |
|--------|---------|
| `tokens/` | Raw design tokens (colors, spacing, typography, radii, shadows) |
| `tailwind.preset.ts` | Tailwind CSS preset that maps tokens to Tailwind utilities |
| `index.ts` | Barrel export of token values |

### Usage

```javascript
// tailwind.config.ts in any consuming package
import { athyperPreset } from "@athyper/theme";

export default {
  presets: [athyperPreset],
  // ...
};
```

---

## `@athyper/ui`

Shared React component library. Three component categories.

### Primitives (17 components)

Base UI components built on shadcn/Radix patterns:

Badge, Button, Card, Dialog, DropdownMenu, Input, Label, ScrollArea, Select, Separator, Sheet, Switch, Tabs, Textarea, Tooltip, Checkbox, Avatar

### Content Components

| Component | Purpose |
|-----------|---------|
| `AttachmentCard` | File attachment card with actions |
| `AttachmentList` | List of attachment cards |
| `EntityDocumentsPanel` | Document panel for entity detail pages |
| `FilePicker` | File selection dialog |
| `DocumentVersionTimeline` | Version history timeline |
| `DocumentAclManager` | ACL management UI |

### Messaging Components

| Component | Purpose |
|-----------|---------|
| `ChatView` | Full chat view with messages |
| `ConversationList` | List of conversations |
| `ConversationListItem` | Single conversation row |
| `MessageBubble` | Single message bubble |
| `MessageComposer` | Message input with attachments |
| `MessageSearchBar` | Search bar for messages |
| `MessageSearchResults` | Search results display |
| `ThreadView` | Threaded reply view |

### Notification Components

| Component | Purpose |
|-----------|---------|
| `NotificationBell` | Bell icon with unread badge |
| `NotificationCard` | Single notification card |
| `NotificationList` | Scrollable notification list |
| `NotificationFilters` | Filter controls |
| `NotificationInboxPanel` | Full inbox panel |
| `MarkAllReadButton` | Mark all read action |

---

## Workbench Packages

Three packages define the module composition for each workbench type:

| Package | Workbench | Purpose |
|---------|-----------|---------|
| `@athyper/workbench-admin` | Admin | System admin modules (meta-studio, policy, jobs, integrations) |
| `@athyper/workbench-partner` | Partner | Partner-facing modules |
| `@athyper/workbench-user` | User | End-user modules (entity CRUD, dashboards) |

Each exports a workbench configuration that defines which navigation modules and pages are available.

---

## Dependency Rules

```
packages/ can import:
  ✅ Other packages (e.g., @athyper/ui imports @athyper/theme)
  ✅ External npm packages (react, tailwindcss, zod, etc.)

packages/ cannot import:
  ❌ @athyper/core
  ❌ @athyper/runtime
  ❌ @athyper/adapter-*
  ❌ @prisma/client
  ❌ Deep imports (@athyper/*/src/*, @athyper/*/dist/*)
```

These rules are enforced by ESLint `no-restricted-imports` in `eslint.config.js`.
