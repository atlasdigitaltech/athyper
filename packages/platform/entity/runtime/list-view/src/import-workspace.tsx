"use client";

import type { EntityListDescriptorV1, EntityListScopeCoordinateV1 } from "@athyper/contract-platform-entity-list";
import { entityListDescriptorOperation, type HttpClient } from "@athyper/platform-api-client";
import { Button } from "@athyper/platform-ui";
import React, { useEffect, useMemo, useState } from "react";
import { ImportWizard } from "./data-operations";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";

export interface RecordImportWorkspaceProps {
  readonly client: HttpClient;
  readonly entityCode: string;
  readonly scopeCoordinate?: EntityListScopeCoordinateV1;
}

export function RecordImportWorkspace({ client, entityCode, scopeCoordinate }: RecordImportWorkspaceProps) {
  const intl = useEntityI18n();
  const [descriptor, setDescriptor] = useState<EntityListDescriptorV1>();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const query = useMemo(() => ({
    ...(scopeCoordinate?.companyCodeId ? { companyCodeId: scopeCoordinate.companyCodeId } : {}),
    ...(scopeCoordinate?.legalEntityId ? { legalEntityId: scopeCoordinate.legalEntityId } : {}),
    ...(scopeCoordinate?.operatingOrganizationId ? { operatingOrganizationId: scopeCoordinate.operatingOrganizationId } : {}),
    ...(scopeCoordinate?.networkAccountId ? { networkAccountId: scopeCoordinate.networkAccountId } : {}),
  }), [scopeCoordinate]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setDescriptor(undefined);
    setError("");
    if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(entityCode)) {
      setError("transfer.chooseEntity");
      return () => { active = false; };
    }
    void client.request(entityListDescriptorOperation, { params: { entityCode }, query, signal: controller.signal })
      .then((value) => { if (active) setDescriptor(value); })
      .catch(() => { if (active) setError("error.unavailable"); });
    return () => { active = false; controller.abort(); };
  }, [client, entityCode, query]);

  return <main className="a-entity-list__import-workspace" aria-busy={!descriptor && !error}>
    <header><div><p>{intl.message("transfer.title")}</p><h1>{intl.message("transfer.importTitle")}</h1><span>{intl.message("transfer.importDescription")}</span></div><Button variant="secondary" size="small" onClick={() => window.location.assign("/operations/data-transfers")}>{intl.message("transfer.activity")}</Button></header>
    {status ? <p role="status" className="a-entity-list__transfer-status">{status}</p> : null}
    {error ? <section className="a-entity-list__transfer-empty" role="alert"><h2>{intl.message("transfer.importUnavailable")}</h2><p>{intl.message(error)}</p><Button variant="secondary" size="small" onClick={() => window.history.back()}>{intl.message("transfer.back")}</Button></section> : null}
    {!descriptor && !error ? <section className="a-entity-list__transfer-empty"><p>{intl.message("transfer.loading")}</p></section> : null}
    {descriptor?.dataOperations ? <ImportWizard client={client} descriptor={descriptor} scopeCoordinate={scopeCoordinate} open onOpenChange={(open) => { if (!open) window.location.assign("/operations/data-transfers"); }} onStatus={setStatus}/> : null}
  </main>;
}
