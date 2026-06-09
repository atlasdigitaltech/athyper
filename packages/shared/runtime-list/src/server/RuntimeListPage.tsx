import { resolvePresenterProps } from "../core/presenterProps";
import { RuntimeListClientProvider } from "../islands/RuntimeListContext";
import { RuntimeListCommandBar } from "../islands/RuntimeListCommandBar";
import { RuntimeListPresenter, RuntimeListToolbar } from "./RuntimeListPresenter";
import { RuntimeListActions } from "./RuntimeListActions";
import type { RuntimeListServerAdapter, RuntimeListSlots } from "../adapter/types";
import type { RawSearchParams } from "../core/types";

interface RuntimeListPageProps {
  adapter:      RuntimeListServerAdapter;
  entityCode:   string;
  searchParams: RawSearchParams;
  slots?:       RuntimeListSlots;
}

export async function RuntimeListPage({
  adapter,
  entityCode,
  searchParams,
  slots,
}: RuntimeListPageProps) {
  const props = await resolvePresenterProps(adapter, entityCode, searchParams);
  const { PageFrame } = adapter;

  const hasActions = Boolean(props.createHref) || props.toolbarActions.length > 0;
  const clientSearch = props.viewMode === "list"
    ? props.search
    : { ...props.search, enabled: false };

  return (
    <RuntimeListClientProvider adapter={props.clientAdapter} search={clientSearch} lazyList={props.lazyList}>
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
        <RuntimeListPresenter
          {...props}
          slots={slots}
        />
      </PageFrame>
    </RuntimeListClientProvider>
  );
}
