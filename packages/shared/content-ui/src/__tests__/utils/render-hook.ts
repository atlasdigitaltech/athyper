/**
 * Thin re-export of `@testing-library/react`'s renderHook + act.
 *
 * Centralized so tests import from one place and we can swap providers
 * (e.g. wrapping with React.StrictMode or context providers) without
 * touching every test file.
 */
export { renderHook, act } from "@testing-library/react";
