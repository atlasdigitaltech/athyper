// lib/user-menu/avatar-color.ts
//
// Deterministic avatar color derived from userId.
// Returns { bg, fg, tokenIndex } for consistent rendering across sessions.
// Uses a 12-slot OKLCH palette with 30° hue increments for perceptual distinctness.

export interface AvatarColor {
    bg: string;
    fg: string;
    tokenIndex: number;
}

/**
 * 12 perceptually-distinct OKLCH hues (30° apart).
 * All share L=0.65 C=0.15 for uniform visual weight.
 * fg is always near-white for contrast.
 */
const PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
    { bg: "oklch(0.65 0.15 15)",  fg: "oklch(0.98 0 0)" },  // red
    { bg: "oklch(0.65 0.15 45)",  fg: "oklch(0.98 0 0)" },  // vermilion
    { bg: "oklch(0.65 0.15 75)",  fg: "oklch(0.98 0 0)" },  // orange
    { bg: "oklch(0.65 0.15 105)", fg: "oklch(0.98 0 0)" },  // amber
    { bg: "oklch(0.65 0.15 135)", fg: "oklch(0.98 0 0)" },  // lime
    { bg: "oklch(0.65 0.15 165)", fg: "oklch(0.98 0 0)" },  // green
    { bg: "oklch(0.65 0.15 195)", fg: "oklch(0.98 0 0)" },  // teal
    { bg: "oklch(0.65 0.15 225)", fg: "oklch(0.98 0 0)" },  // cyan
    { bg: "oklch(0.65 0.15 255)", fg: "oklch(0.98 0 0)" },  // blue
    { bg: "oklch(0.65 0.15 285)", fg: "oklch(0.98 0 0)" },  // indigo
    { bg: "oklch(0.65 0.15 315)", fg: "oklch(0.98 0 0)" },  // violet
    { bg: "oklch(0.65 0.15 345)", fg: "oklch(0.98 0 0)" },  // magenta
];

/** Fallback for missing or empty userId. Neutral gray. */
export const AVATAR_FALLBACK: AvatarColor = {
    bg: "oklch(0.55 0 0)",
    fg: "oklch(0.98 0 0)",
    tokenIndex: -1,
};

/**
 * Hash a userId to a deterministic palette slot.
 * Uses djb2 variant (hash * 33 ^ char) without signed-int coercion.
 */
export function avatarColorFromUserId(userId: string): AvatarColor {
    if (!userId) return AVATAR_FALLBACK;

    let hash = 5381;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash * 33) ^ userId.charCodeAt(i);
    }
    const idx = ((hash % PALETTE.length) + PALETTE.length) % PALETTE.length;
    return { ...PALETTE[idx], tokenIndex: idx };
}
