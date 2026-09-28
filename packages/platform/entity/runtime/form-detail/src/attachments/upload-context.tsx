"use client";
import { createContext } from "react";

/** Shared by the collection disclosure and its mounted uploader; do not duplicate. */
export const UploadExpandedContext = createContext(true);
