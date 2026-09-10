import { EntityRecordAction, type EntityActionHandlers, type RecordAction } from "@athyper/platform-entity-form-detail";
import { useBusinessPartner360 } from "../business-partner-360-context";

export function useBusinessPartnerActionHandlers(): EntityActionHandlers {
  const { openTransactionContext, selectSection, retryDecisions } = useBusinessPartner360();
  return {
    selectContext: openTransactionContext,
    prerequisites: () => selectSection("requests"),
    retry: retryDecisions,
    verify: () => {
      const cookie = document.cookie.split("; ").find(value => value.startsWith("__Host-athyper-csrf=") || value.startsWith("athyper-csrf="));
      const csrf = cookie?.slice(cookie.indexOf("=") + 1);
      if (!csrf) { retryDecisions?.(); return; }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `/api/auth/step-up/start?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      const input = document.createElement("input"); input.type = "hidden"; input.name = "csrfToken"; input.value = decodeURIComponent(csrf);
      form.append(input); document.body.append(form); form.submit();
    },
  };
}
export function BusinessPartnerAction({ action }: { readonly action: RecordAction }) {
  const { summary } = useBusinessPartner360();
  const handlers = useBusinessPartnerActionHandlers();
  return <EntityRecordAction action={action} handlers={handlers} readOnly={summary.completeness.readOnly} />;
}
