import type { IntlRuntime } from "./index";

type Reference = { readonly labelKey: string; readonly defaultText: string };
type Labels = { readonly entity?: Reference; readonly title?: Reference; readonly options?: Readonly<Record<string, Readonly<Record<string, Reference>>>>; readonly fields: Readonly<Record<string, Reference>> };
type Labelled = { readonly label: string; readonly localizedLabel?: Reference };
type Descriptor = {
  readonly localizedLabels?: Labels;
  readonly entity: { readonly label: string; readonly pluralLabel?: string };
  readonly fields?: readonly (Labelled & { readonly key: string; readonly options?: readonly (Labelled & { readonly value: string })[]; readonly filterOptions?: readonly (Labelled & { readonly value: string | number | boolean })[] })[];
  readonly actions?: readonly { readonly label: string; readonly kind?: string }[];
  readonly surface?: { readonly title: string };
  readonly presentation?: {
    readonly localizedLabels?: Labels;
    readonly sections: readonly Labelled[];
    readonly navigation?: { readonly tabs?: readonly Labelled[] };
  };
};

/** Only authorized descriptor labels are transformed; record values are untouched.
 * Call at render time, retaining the untranslated descriptor in state/cache. */
export function localizeEntityLabels<T extends Descriptor>(descriptor: T, intl: IntlRuntime): T {
  const labels = descriptor.localizedLabels ?? descriptor.presentation?.localizedLabels;
  const label = <L extends Labelled>(item: L): L => ({ ...item, label: intl.text(item.localizedLabel ?? item.label) });
  return { ...descriptor,
    ...(descriptor.actions ? { actions: descriptor.actions.map(action => action.kind === "edit" ? {...action, label: intl.message("entity.action.edit")} : action) } : {}),
    entity: { ...descriptor.entity,
      label: intl.text(labels?.entity ?? descriptor.entity.label),
      ...(labels?.title || descriptor.entity.pluralLabel ? { pluralLabel: intl.text(labels?.title ?? descriptor.entity.pluralLabel!) } : {}) },
    ...(descriptor.fields ? { fields: descriptor.fields.map(field => ({ ...field, label: intl.text(labels?.fields[field.key] ?? field.label),
      ...(field.options ? { options: field.options.map(option => ({...option, label: intl.text(labels?.options?.[field.key]?.[String(option.value)] ?? option.label)})) } : {}),
      ...(field.filterOptions ? { filterOptions: field.filterOptions.map(option => ({...option, label: intl.text(labels?.options?.[field.key]?.[String(option.value)] ?? option.label)})) } : {}),
    })) } : {}),
    ...(descriptor.surface ? { surface: { ...descriptor.surface, title: intl.text(labels?.title ?? descriptor.surface.title) } } : {}),
    ...(descriptor.presentation ? { presentation: { ...descriptor.presentation,
      sections: descriptor.presentation.sections.map(label),
      ...(descriptor.presentation.navigation ? { navigation: { ...descriptor.presentation.navigation,
        ...(descriptor.presentation.navigation.tabs ? { tabs: descriptor.presentation.navigation.tabs.map(label) } : {}),
      } } : {}),
    } } : {}),
  } as T;
}
