"use client";

import { createContext, useContext } from "react";

export interface NotificationStreamState {
  unreadCount: number;
}

export const NotificationStreamContext = createContext<NotificationStreamState>({ unreadCount: 0 });

export function useNotificationStream(): NotificationStreamState {
  return useContext(NotificationStreamContext);
}
