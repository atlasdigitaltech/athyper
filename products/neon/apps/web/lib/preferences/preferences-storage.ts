"use client";


import { setClientCookie } from "../cookie.client";
import { setLocalStorageValue } from "../local-storage.client";

import { type PreferenceKey, PREFERENCE_PERSISTENCE } from "./preferences-config";

import { setValueToCookie } from "@/app/actions/preferences";

export async function persistPreference(key: PreferenceKey, value: string) {
  const mode = PREFERENCE_PERSISTENCE[key];

  switch (mode) {
    case "none":
      return;

    case "client-cookie":
      setClientCookie(key, value);
      return;

    case "server-cookie":
      await setValueToCookie(key, value);
      return;

    case "localStorage":
      setLocalStorageValue(key, value);
      return;

    default:
      return;
  }
}
