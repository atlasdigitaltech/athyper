import { ChevronLeft, ChevronRight } from "lucide-react";
import { runtimeListText } from "../core/resources";
import { runtimeTableChrome } from "../core/table-chrome";

export type RuntimePaginationAction =
  | { kind: "link"; href: string }
  | { kind: "button"; onClick: () => void; disabled?: boolean }
  | { kind: "disabled" };

interface RuntimePaginationControlsProps {
  previous:  RuntimePaginationAction;
  next:      RuntimePaginationAction;
  pageLabel: string;
}

export function RuntimePaginationControls({
  previous,
  next,
  pageLabel,
}: RuntimePaginationControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <RuntimePaginationActionControl
        action={previous}
        label={runtimeListText.actions.previous}
        direction="previous"
      />
      <span className={runtimeTableChrome.footerPageLabel}>
        {pageLabel}
      </span>
      <RuntimePaginationActionControl
        action={next}
        label={runtimeListText.actions.next}
        direction="next"
      />
    </div>
  );
}

function RuntimePaginationActionControl({
  action,
  label,
  direction,
}: {
  action:    RuntimePaginationAction;
  label:     string;
  direction: "previous" | "next";
}) {
  const icon = direction === "previous"
    ? <ChevronLeft aria-hidden="true" className={runtimeTableChrome.footerButtonIcon} />
    : <ChevronRight aria-hidden="true" className={runtimeTableChrome.footerButtonIcon} />;
  const content = direction === "previous" ? (
    <>
      {icon}
      {label}
    </>
  ) : (
    <>
      {label}
      {icon}
    </>
  );

  if (action.kind === "link") {
    return (
      <a className={runtimeTableChrome.footerButton} href={action.href}>
        {content}
      </a>
    );
  }

  if (action.kind === "button") {
    return (
      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled}
        className={`${runtimeTableChrome.footerButton} disabled:opacity-60`}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={runtimeTableChrome.footerButtonDisabled}>
      {content}
    </span>
  );
}
