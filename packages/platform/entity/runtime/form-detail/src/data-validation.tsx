"use client";
import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
} from "react";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { entityEnglishMessages } from "@athyper/platform-i18n/entity-messages";
import type { FieldValidationIssue } from "@athyper/contract-platform-entity-runtime";
export interface DisplayIssue {
  id: string;
  message: string;
}
const Context = createContext<{
  attempted: boolean;
  mode: "draft" | "submit";
  register: (
    id: string,
    read: (mode: "draft" | "submit") => DisplayIssue[],
  ) => () => void;
  validate: (mode?: "draft" | "submit") => boolean;
} | null>(null);
export const useDataValidation = () => useContext(Context);
export function useValidationMessage() {
  const i18n = useOptionalI18n();
  return (issue: FieldValidationIssue) => {
    const fallback =
      entityEnglishMessages[
        `validation.${issue.code}` as keyof typeof entityEnglishMessages
      ];
    const template = i18n?.message(issue.messageKey, issue.params) ?? fallback;
    return (
      !template || template === issue.messageKey ? fallback : template
    ).replace(/\{(field|max)\}/g, (_, key) =>
      String(issue.params[key as keyof typeof issue.params] ?? ""),
    );
  };
}
export function DataValidationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const parent = useDataValidation();
  const parentRegister = parent?.register;
  const readers = useRef(
      new Map<string, (mode: "draft" | "submit") => DisplayIssue[]>(),
    ),
    [attempted, setAttempted] = useState(false),
    [mode, setMode] = useState<"draft" | "submit">("submit"),
    [errors, setErrors] = useState<DisplayIssue[]>([]);
  const register = useCallback(
    (id: string, read: (mode: "draft" | "submit") => DisplayIssue[]) => {
      readers.current.set(id, read);
      const unregisterParent = parentRegister?.(id, read);
      return () => {
        readers.current.delete(id);
        unregisterParent?.();
      };
    },
    [parentRegister],
  );
  const collect = (validationMode = mode) =>
    [...readers.current.values()]
      .flatMap((read) => read(validationMode))
      .sort((a, b) => {
        const left = document.getElementById(a.id),
          right = document.getElementById(b.id);
        if (!left || !right) return 0;
        return left.compareDocumentPosition(right) &
          Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1;
      });
  const validate = (validationMode: "draft" | "submit" = "submit") => {
    setMode(validationMode);
    const issues = collect(validationMode);
    setAttempted(true);
    setErrors(issues);
    if (issues.length) {
      focusValidationField(issues[0]!.id);
      return false;
    }
    return true;
  };
  return (
    <Context.Provider
      value={{
        attempted: attempted || Boolean(parent?.attempted),
        mode: parent?.attempted ? parent.mode : mode,
        register,
        validate,
      }}
    >
      <div
        onChangeCapture={() => {
          if (attempted) setTimeout(() => setErrors(collect()), 0);
        }}
      >
        {errors.length > 0 && (
          <div className="a-validation-summary" role="alert">
            <p>{entityEnglishMessages["validation.summary"]}</p>
            <ul>
              {errors.map((e) => (
                <li key={e.id}>
                  <a
                    href={`#${e.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      focusValidationField(e.id);
                    }}
                  >
                    {e.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {children}
      </div>
    </Context.Provider>
  );
}

function focusValidationField(id: string) {
  const node = document.getElementById(id);
  for (
    let parent = node?.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (parent.tagName === "DETAILS")
      (parent as HTMLDetailsElement).open = true;
  }
  node?.focus();
}
