"use client";

import { useState, useCallback } from "react";

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
}

export interface Toast extends ToastOptions {
  id: string;
}

// Module-level state for cross-component access
let _toastCount = 0;
const _listeners: Array<(toasts: Toast[]) => void> = [];
let _toasts: Toast[] = [];

function notifyListeners() {
  _listeners.forEach((fn) => fn([..._toasts]));
}

function addToast(opts: ToastOptions) {
  const id = String(++_toastCount);
  const duration = opts.duration ?? 4000;
  _toasts = [..._toasts, { ...opts, id }];
  notifyListeners();
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, duration);
}

export function useToast() {
  const toast = useCallback((opts: ToastOptions) => {
    addToast(opts);
  }, []);

  return { toast };
}
