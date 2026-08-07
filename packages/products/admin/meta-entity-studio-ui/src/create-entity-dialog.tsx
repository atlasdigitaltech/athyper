"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input } from "@athyper/platform-ui";
import type {
  MetaEntityClass,
  MetaEntityClassProfile,
  MetaEntityCreateCommand,
  MetaEntityModuleCoordinate,
} from "@athyper/meta-entity-authoring-contracts";
import { selectClassName } from "./editor-controls";

export function CreateEntityDialog({
  open,
  moduleCoordinates,
  classProfiles,
  busy,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  moduleCoordinates: readonly MetaEntityModuleCoordinate[];
  classProfiles: readonly MetaEntityClassProfile[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (command: MetaEntityCreateCommand) => void;
}) {
  const [coordinateKey, setCoordinateKey] = useState("");
  const [entityCode, setEntityCode] = useState("");
  const [entityClass, setEntityClass] = useState<MetaEntityClass>("business");
  const [changeSetCode, setChangeSetCode] = useState("initial_contract");
  const [title, setTitle] = useState("Initial Entity contract");
  const [storagePlane, setStoragePlane] = useState<"athyper" | "neon" | "mesh">("neon");
  const [storageSchema, setStorageSchema] = useState("document");
  const [storageObject, setStorageObject] = useState("");
  useEffect(() => {
    if (open && !coordinateKey && moduleCoordinates[0]) setCoordinateKey(moduleCoordinates[0].coordinateKey);
  }, [coordinateKey, moduleCoordinates, open]);
  useEffect(() => setStorageObject(entityCode), [entityCode]);
  const coordinate = useMemo(() => moduleCoordinates.find((item) => item.coordinateKey === coordinateKey) ?? null, [coordinateKey, moduleCoordinates]);
  const valid = Boolean(coordinate && /^[a-z][a-z0-9_]{1,62}$/.test(entityCode) && storageSchema && storageObject && changeSetCode && title.trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || !coordinate) return;
    onCreate({
      moduleCoordinate: { planeCode: coordinate.planeCode, workspaceCode: coordinate.workspaceCode, moduleCode: coordinate.moduleCode },
      entityCode,
      entityClass,
      initialChangeSet: { changeSetCode, title: title.trim(), storagePlane, storageSchema, storageObject },
    });
  };

  return <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}><DialogContent className="sm:max-w-2xl"><form onSubmit={submit}><DialogHeader><DialogTitle>Create canonical Entity</DialogTitle></DialogHeader><p className="mt-2 text-sm leading-6 text-muted-foreground">Creates the stable Entity identity and its first tenant-owned draft. The module UUID is resolved server-side from the canonical coordinate.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">Module coordinate<select className={selectClassName} value={coordinateKey} onChange={(event) => setCoordinateKey(event.target.value)} disabled={busy}>{moduleCoordinates.map((item) => <option key={item.coordinateKey} value={item.coordinateKey}>{item.workspaceName} / {item.moduleName} · {item.coordinateKey}</option>)}</select></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Entity code<Input value={entityCode} onChange={(event) => setEntityCode(event.target.value.toLowerCase())} placeholder="service_contract" disabled={busy} /><span>Lowercase canonical identity; immutable after creation.</span></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Entity class<select className={selectClassName} value={entityClass} onChange={(event) => setEntityClass(event.target.value as MetaEntityClass)} disabled={busy}>{classProfiles.map((profile) => <option key={profile.entityClass} value={profile.entityClass}>{profile.fallbackName}</option>)}</select><span>{classProfiles.find((profile) => profile.entityClass === entityClass)?.description}</span></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Change-set code<Input value={changeSetCode} onChange={(event) => setChangeSetCode(event.target.value.toLowerCase())} disabled={busy} /></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Change-set title<Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Storage plane<select className={selectClassName} value={storagePlane} onChange={(event) => setStoragePlane(event.target.value as typeof storagePlane)} disabled={busy}><option value="athyper">Athyper</option><option value="neon">Neon</option><option value="mesh">Mesh</option></select></label><div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-xs font-medium text-muted-foreground">Schema<Input value={storageSchema} onChange={(event) => setStorageSchema(event.target.value.toLowerCase())} disabled={busy} /></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Object<Input value={storageObject} onChange={(event) => setStorageObject(event.target.value.toLowerCase())} disabled={busy} /></label></div></div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={!valid || busy}>Create Entity and draft</Button></DialogFooter></form></DialogContent></Dialog>;
}
