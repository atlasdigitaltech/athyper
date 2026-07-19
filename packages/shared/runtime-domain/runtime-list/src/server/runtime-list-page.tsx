import { resolvePresenterProps } from "../core/presenter-props";
import { RuntimeListClientProvider } from "../islands/runtime-list-context";
import { RuntimeListCommandBar } from "../islands/runtime-list-command-bar";
import { RuntimeListWarmPresenter } from "../islands/runtime-list-warm-presenter";
import { RuntimeListToolbar } from "./runtime-list-presenter";
import { RuntimeListActions } from "./runtime-list-actions";
import { OrganizePaletteProvider } from "../islands/organize/organize-state";
import type { RuntimeListServerAdapter, RuntimeListSlots } from "../adapter/types";
import type { RawSearchParams } from "../core/types";
import { RuntimeListPageFrame } from "../page/runtime-list-page-frame";
import type React from "react";

interface RuntimeListPageProps {
  adapter:      RuntimeListServerAdapter;
  entityCode:   string;
  searchParams: RawSearchParams;
  slots?:       RuntimeListSlots;
  afterResolve?:() => React.ReactNode;
  onResolved?:(durationMs: number) => void;
}

export async function RuntimeListPage({
  adapter,
  entityCode,
  searchParams,
  slots,
  afterResolve,
  onResolved,
}: RuntimeListPageProps) {
  const startedAt = performance.now();
  const props = await resolvePresenterProps(adapter, entityCode, searchParams);
  onResolved?.(performance.now() - startedAt);
  const PageFrame = adapter.PageFrame ?? RuntimeListPageFrame;

  const hasActions = Boolean(props.createHref) || props.toolbarActions.length > 0;
  const clientSearch = props.viewMode === "list"
    ? props.search
    : { ...props.search, enabled: false };

  return (
    <>
      <RuntimeListClientProvider
        key={props.lazyList.cacheKey}
        adapter={props.clientAdapter}
        search={clientSearch}
        lazyList={props.lazyList}
      >
        <OrganizePaletteProvider>
          <PageFrame
            eyebrow={props.eyebrow}
            title={props.entityName}
            description=""
            commandBar={<RuntimeListCommandBar {...props} slots={slots} />}
            actions={
              hasActions ? (
                <RuntimeListActions
                  createHref={props.createHref}
                  toolbarActions={props.toolbarActions}
                />
              ) : undefined
            }
            toolbar={<RuntimeListToolbar {...props} slots={slots} />}
          >
            <RuntimeListWarmPresenter
              presenterProps={props}
              slots={slots}
            />
          </PageFrame>
        </OrganizePaletteProvider>
      </RuntimeListClientProvider>
      {afterResolve?.()}
    </>
  );
}
