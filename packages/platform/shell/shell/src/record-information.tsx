"use client";
import { viewportQuery } from "@athyper/platform-theme/tokens";
import { useEffect, useId, useRef, useState } from "react";
import { Button, Dialog, DialogContent } from "@athyper/platform-ui";
import { InfoIcon, CopyIcon, CloseIcon } from "@athyper/platform-icons";
import {
  useActiveRecordFooterInformation,
  type RecordFooterInformation,
} from "./record-footer";

export function RecordInformationControl() {
  const information = useActiveRecordFooterInformation();
  return information ? (
    <Information key={JSON.stringify(information)} information={information} />
  ) : null;
}
function Information({
  information,
}: {
  information: RecordFooterInformation;
}) {
  const [open, setOpen] = useState(false),
    [compact, setCompact] = useState(false),
    [notice, setNotice] = useState("");
  const anchor = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    id = useId();
  const rows = [
    ["Record ID", information.recordId],
    ["Metadata release", String(information.metadataRelease)],
    ...(information.recordRevision === undefined
      ? []
      : [["Record revision", String(information.recordRevision)]]),
  ];
  useEffect(() => {
    const media = matchMedia(viewportQuery({ below: "medium" }));
    const update = () => {
      setOpen(false);
      setCompact(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const close = () => {
    setOpen(false);
    anchor.current?.focus();
  };
  useEffect(() => {
    if (!open || compact) return;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !anchor.current?.contains(event.target)
      )
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, compact]);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice("Copy unavailable. Select and copy the details manually.");
    }
  };
  const content = (
    <>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <span>{value}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Copy ${label}`}
                title={`Copy ${label}`}
                onClick={() => void copy(value!)}
              >
                <CopyIcon aria-hidden="true" />
              </Button>
            </dd>
          </div>
        ))}
      </dl>
      <footer className="athyper-record-information__actions">
      <p role="status">{notice}</p>
      <Button
        variant="secondary"
        size="small"
        onClick={() =>
          void copy(
            rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
          )
        }
      >
        <CopyIcon aria-hidden="true" />
        Copy details
      </Button>
      </footer>
    </>
  );
  return (
    <div className="athyper-record-information">
      <button
        ref={anchor}
        type="button"
        className="athyper-record-information__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={!compact ? id : undefined}
        onClick={() => {
          setNotice("");
          setOpen(!open);
        }}
      >
        <InfoIcon aria-hidden="true" />
        Record information
      </button>
      {compact ? (
        <Dialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) anchor.current?.focus();
          }}
        >
          <DialogContent
            portal
            title="Record information"
            className="athyper-record-information__dialog"
          >
            <Button variant="ghost" size="icon" className="athyper-record-information__close" aria-label="Close record information" onClick={close}>
              <CloseIcon aria-hidden="true" />
            </Button>
            {content}
          </DialogContent>
        </Dialog>
      ) : open ? (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label="Record information"
          className="athyper-record-information__popover"
        >
          <header>
            <strong>Record information</strong>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close record information"
              onClick={close}
            >
              <CloseIcon aria-hidden="true" />
            </Button>
          </header>
          {content}
        </div>
      ) : null}
    </div>
  );
}
