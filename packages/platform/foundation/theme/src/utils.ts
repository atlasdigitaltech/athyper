/**
 * @athyper/platform-theme — Utilities
 *
 * SCOPE: This file contains ONLY the cn() class merging utility.
 * Do not add general-purpose helpers here. Theme package scope is:
 *   contract, preset registry, Tailwind mapping, semantic colors, base CSS.
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with proper conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
