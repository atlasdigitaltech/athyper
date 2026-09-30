"use client";
import { useEffect, useRef } from "react";

const EVENT = "athyper:context-departure";
interface DepartureState {
  dirty: boolean;
  busy: boolean;
}

/** A running command must settle before its page is reset by a context switch. */
export function useContextDepartureGuard(state: DepartureState) {
  const current = useRef(state);
  current.current = state;
  useEffect(() => {
    const listener = (event: Event) => {
      const request = (event as CustomEvent<DepartureState>).detail;
      request.dirty ||= current.current.dirty;
      request.busy ||= current.current.busy;
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, []);
}

export function contextDepartureState(): DepartureState {
  const state = { dirty: false, busy: false };
  window.dispatchEvent(new CustomEvent(EVENT, { detail: state }));
  return state;
}
