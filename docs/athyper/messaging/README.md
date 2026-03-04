# In-App Messaging

The messaging system provides real-time direct and group conversations within the Athyper platform. It is a Tier 3 enterprise service.

---

## Architecture

```
Browser (React)                    BFF (Next.js)                Runtime
    │                                   │                        │
    ├─ ConversationList ──► GET /api/conversations ──────────────►│
    ├─ ChatView ──────────► GET /api/conversations/:id/messages ─►│
    ├─ MessageComposer ──► POST /api/conversations/:id/messages ─►│
    ├─ ThreadView ────────► GET /api/conversations/:id/threads ──►│
    ├─ MessageSearchBar ──► GET /api/conversations/search ───────►│
    │                                   │                        │
    └─ SSE Stream ◄────────── /api/conversations/stream ◄────────┘
```

---

## Domain Models

### Conversation

File: `framework/runtime/src/services/enterprise-services/in-app-messaging/domain/models/Conversation.ts`

```typescript
interface Conversation {
    id: string;
    tenantId: string;
    type: "direct" | "group";
    title?: string;           // Group conversations only
    participants: Participant[];
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    lastMessageAt: Date;
    metadata?: Record<string, unknown>;
}

interface Participant {
    userId: string;
    role: "owner" | "admin" | "member";
    joinedAt: Date;
    lastReadAt?: Date;
    muted: boolean;
}
```

Tests: `domain/models/Conversation.test.ts`

### Message

File: `framework/runtime/src/services/enterprise-services/in-app-messaging/domain/models/Message.ts`

```typescript
interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    type: "text" | "system" | "attachment";
    threadId?: string;        // For threaded replies
    replyToId?: string;       // For inline replies
    editedAt?: Date;
    deletedAt?: Date;         // Soft delete
    deliveries: MessageDelivery[];
    createdAt: Date;
}

interface MessageDelivery {
    userId: string;
    deliveredAt?: Date;
    readAt?: Date;
}
```

Tests: `domain/models/Message.test.ts`

---

## Services

### ConversationService

File: `domain/services/ConversationService.ts`

| Operation | Description |
|-----------|-------------|
| `create` | Create direct or group conversation |
| `addParticipant` | Add user to group conversation |
| `removeParticipant` | Remove user from group conversation |
| `updateTitle` | Update group conversation title |
| `mute` / `unmute` | Mute/unmute notifications for a conversation |
| `archive` | Archive a conversation |
| `list` | List conversations for a user (with unread counts) |

### MessageService

File: `domain/services/MessageService.ts`

| Operation | Description |
|-----------|-------------|
| `send` | Send a message to a conversation |
| `edit` | Edit a sent message |
| `delete` | Soft-delete a message |
| `markRead` | Mark messages as read |
| `search` | Full-text search across messages |
| `getThread` | Get threaded replies for a message |
| `replyToThread` | Send a reply to a message thread |

---

## Access Control

File: `domain/policies/ConversationAccessPolicy.ts`

| Check | Enforcement |
|-------|-------------|
| **Participant check** | Only conversation participants can read/send messages |
| **Tenant isolation** | Users can only access conversations in their tenant |
| **Role-based actions** | Only owners/admins can add/remove participants, update title |
| **Rate limiting** | Per-user message rate limits |

---

## Persistence

| Repository | File | Tables |
|-----------|------|--------|
| `ConversationRepo` | `persistence/ConversationRepo.ts` | Conversation metadata |
| `ParticipantRepo` | `persistence/ParticipantRepo.ts` | Conversation participants |
| `MessageRepo` | `persistence/MessageRepo.ts` | Messages |
| `MessageDeliveryRepo` | `persistence/MessageDeliveryRepo.ts` | Delivery/read receipts |

Tests: `persistence/repositories.test.ts`

---

## Module Registration

File: `framework/runtime/src/services/enterprise-services/in-app-messaging/index.ts`

The messaging module registers as a `RuntimeModule`:

```typescript
export const module: RuntimeModule = {
    name: "messaging",
    register(container) {
        // Bind repositories
        // Bind domain services
        // Bind access policies
    },
    contribute(container) {
        // Register HTTP routes
        // Register health check
    },
};
```

---

## UI Components

Shared React components in `packages/ui/src/messaging/`:

| Component | Purpose |
|-----------|---------|
| `ChatView` | Full chat interface with message list and composer |
| `ConversationList` | Sidebar list of conversations with unread badges |
| `ConversationListItem` | Single conversation row (avatar, name, preview, time) |
| `MessageBubble` | Individual message display (sent/received styling) |
| `MessageComposer` | Message input with attachment support |
| `MessageSearchBar` | Search bar with query input |
| `MessageSearchResults` | Search results display |
| `ThreadView` | Threaded reply view |

API client: `packages/api-client/src/messaging/messagingClient.ts`

### Neon Pages

| Page | File |
|------|------|
| Messages page | `products/neon/apps/web/app/(app)/messages/page.tsx` |
| Messaging dashboard | `products/neon/apps/web/app/(shell)/wb/[wb]/dashboards/messaging/page.tsx` |

---

## Collaboration Service (Comments)

Separate from messaging, the collaboration module provides entity-level comments.

File: `framework/runtime/src/services/enterprise-services/collaboration/`

### Features (31 files)

| Feature | Service | Purpose |
|---------|---------|---------|
| Entity comments | `EntityCommentService` | Threaded comments on any entity |
| Mentions | `MentionService` | @mention users in comments |
| Reactions | `ReactionService` | Emoji reactions on comments |
| Read tracking | `ReadTrackingService` | Track which comments have been read |
| Approval comments | `ApprovalCommentService` | Comments linked to approval workflows |
| Attachment links | `AttachmentLinkService` | Link documents to comments |
| Comment analytics | `CommentAnalyticsService` | Comment activity metrics |
| Comment search | `CommentSearchService` | Full-text comment search |
| Comment moderation | `CommentModerationService` | Flag/review/remove comments |
| Comment retention | `CommentRetentionService` | Retention policies and cleanup |
| Comment SLA | `CommentSLAService` | SLA tracking on comment responses |
| Comment drafts | `CommentDraftService` | Auto-save draft comments |
| Rate limiter | `RateLimiter` | Per-user comment rate limiting |

### Background Workers

| Worker | Purpose |
|--------|---------|
| `analytics-aggregation.worker.ts` | Aggregate comment analytics daily |
| `mention-notification.worker.ts` | Send notifications for @mentions |
| `retention-execution.worker.ts` | Execute retention policy cleanup |

### UI Components (Neon)

| Component | File |
|-----------|------|
| `CommentInput` | `products/neon/apps/web/app/(shell)/app/components/CommentInput.tsx` |
| `CommentList` | `products/neon/apps/web/app/(shell)/app/components/CommentList.tsx` |
| `CommentThread` | `products/neon/apps/web/app/(shell)/app/components/CommentThread.tsx` |
| `ModerationQueue` | `products/neon/apps/web/app/(shell)/app/components/ModerationQueue.tsx` |

---

## Notification Integration

The messaging and collaboration modules integrate with the notification service:

```
New message / @mention / reaction
        │
        ▼
  Notification Orchestrator (Tier 2)
        │
        ├─► In-App notification
        ├─► Email (if preference allows)
        ├─► Push notification
        └─► Teams / WhatsApp (if configured)
```

---

## Database Schema (`collab`)

| Table | Purpose |
|-------|---------|
| `collab.comments` | Entity comments |
| `collab.comment_replies` | Threaded replies |
| `collab.mentions` | @mention references |
| `collab.reactions` | Emoji reactions |
| `collab.read_tracking` | Read status per user |
| `collab.comment_flags` | Moderation flags |
| `collab.comment_drafts` | Auto-saved drafts |
| `collab.approval_comments` | Approval-linked comments |
| `collab.comment_sla` | SLA tracking records |

SQL: `framework/adapters/db/src/sql/080_collab.sql`

---

## Related Documentation

- [Architecture](../architecture/README.md) — System architecture
- [Content Management](../content-management/README.md) — Document attachments
- [Security](../security/README.md) — Rate limiting, access control
