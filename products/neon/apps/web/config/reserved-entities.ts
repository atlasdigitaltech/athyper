// config/reserved-entities.ts
//
// Re-exports reserved slug validation for convenience.
// Entity slugs registered in core.module must not collide with these.

export { isReservedSlug, RESERVED_SLUGS } from "@/lib/nav/reserved-keywords";
