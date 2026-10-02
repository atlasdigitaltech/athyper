"use client";
import React, { useState, type DragEvent, type ReactNode } from "react";
import {
  ENTITY_LIST_MAX_SORT_LEVELS,
  type ListFieldDescriptorV1,
  type ListSortV1,
} from "@athyper/contract-platform-entity-list";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  MoreVerticalIcon,
  PlusIcon,
  SortIcon,
  TrashIcon,
} from "@athyper/platform-icons";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import {
  Badge,
  Button,
  Checkbox,
  ChoiceSelect,
  Drawer,
  Input,
  Label,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SegmentedControl,
} from "@athyper/platform-ui";

/* The Sort, Group by, Display and Views sections every collection uses (entity
 * lists and Notifications/Inbox): the list's anatomy and wording, driven only by
 * field metadata and the host's state. Hosts own drafts, apply and footers. */

type Field = Pick<ListFieldDescriptorV1, "key" | "label" | "valueKind">;

/** What ascending and descending look like for a field's value kind ("A to Z",
 * "Oldest first"); accessible names keep Ascending/Descending. */
export function collectionSortDirectionKeys(valueKind: Field["valueKind"] | undefined): {
  readonly asc: string;
  readonly desc: string;
} {
  switch (valueKind) {
    case "integer":
    case "decimal":
    case "money":
      return { asc: "list.sort.lowHigh", desc: "list.sort.highLow" };
    case "date":
    case "datetime":
      return { asc: "list.sort.oldestFirst", desc: "list.sort.newestFirst" };
    case "boolean":
      return { asc: "list.sort.noFirst", desc: "list.sort.yesFirst" };
    default:
      return { asc: "list.sort.az", desc: "list.sort.za" };
  }
}

const move = <T,>(items: readonly T[], from: number, to: number): T[] => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
};

/** The "⋯" menu on ordered rows: the keyboard and touch alternative to dragging. */
export function CollectionReorderMenu({
  item,
  index,
  count,
  onMove,
  onRemove,
  removeLabel,
}: {
  /** Row name used in the accessible label, e.g. "Name" or "sort 2". */
  readonly item: string;
  readonly index: number;
  readonly count: number;
  readonly onMove: (target: number) => void;
  /** Omitted when the row cannot be removed (for example the identity column). */
  readonly onRemove?: () => void;
  /** Wording for remove, e.g. "Hide column". */
  readonly removeLabel?: string;
}) {
  const intl = useEntityI18n();
  return (
    <Menu>
      <MenuTrigger
        className="a-entity-list__reorder-trigger"
        aria-label={intl.message("list.reorder.actionsFor", { item })}
        title={intl.message("list.reorder.actionsFor", { item })}
      >
        <MoreVerticalIcon size={18} />
      </MenuTrigger>
      <MenuContent portal className="a-entity-list__reorder-menu">
        {index > 1 ? (
          <MenuItem onClick={() => onMove(0)}>
            <ArrowUpIcon size={16} />
            {intl.message("list.reorder.moveTop")}
          </MenuItem>
        ) : null}
        <MenuItem disabled={index === 0} onClick={() => onMove(index - 1)}>
          <ArrowUpIcon size={16} />
          {intl.message("list.reorder.moveUp")}
        </MenuItem>
        <MenuItem disabled={index >= count - 1} onClick={() => onMove(index + 1)}>
          <ArrowDownIcon size={16} />
          {intl.message("list.reorder.moveDown")}
        </MenuItem>
        {onRemove ? (
          <MenuItem onClick={onRemove}>
            <TrashIcon size={16} />
            {removeLabel ?? intl.message("list.reorder.remove")}
          </MenuItem>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

/** Sort levels: drag or menu to reorder, field choice, direction in the field's terms. */
export function CollectionSortEditor({
  fields,
  draft,
  onDraftChange,
  maxLevels = ENTITY_LIST_MAX_SORT_LEVELS,
  footer,
  renderField,
  renderAdd,
}: {
  /** Sortable fields only. */
  readonly fields: readonly Field[];
  readonly draft: readonly ListSortV1[];
  readonly onDraftChange: (sort: readonly ListSortV1[]) => void;
  readonly maxLevels?: number;
  readonly footer: ReactNode;
  /** A richer field picker (entity lists search long field lists); defaults to ChoiceSelect. */
  readonly renderField?: (input: {
    readonly label: string;
    readonly fields: readonly Field[];
    readonly value: string;
    readonly onChange: (key: string) => void;
  }) => ReactNode;
  /** A richer "Add sort level" (entity lists open their field catalogue); defaults to a menu. */
  readonly renderAdd?: (input: {
    readonly label: string;
    readonly count: number;
    readonly maximum: number;
    readonly add: (key: string) => void;
    readonly remove: (key: string) => void;
  }) => ReactNode;
}) {
  const intl = useEntityI18n();
  const [dragIndex, setDragIndex] = useState<number>();
  const maximum = Math.min(maxLevels, fields.length);
  const remaining = fields.filter((field) => !draft.some((item) => item.field === field.key));
  const drop = (event: DragEvent<HTMLDivElement>, target: number) => {
    event.preventDefault();
    if (dragIndex === undefined || dragIndex === target) return;
    onDraftChange(move(draft, dragIndex, target));
    setDragIndex(undefined);
  };
  return (
    <>
      <Drawer.Body className="a-entity-list__sort-content">
        {draft.length ? (
          <div className="a-entity-list__sort-list">
            {draft.map((item, index) => {
              const available = fields.filter(
                (field) => field.key === item.field || !draft.some((candidate) => candidate.field === field.key),
              );
              const keys = collectionSortDirectionKeys(fields.find((field) => field.key === item.field)?.valueKind);
              const choice = (key: string, name: string) => (
                <>
                  <span aria-hidden="true">{intl.message(key)}</span>
                  <span className="a-visually-hidden">{intl.message(name)}</span>
                </>
              );
              const replace = (next: ListSortV1) =>
                onDraftChange(draft.map((candidate, at) => (at === index ? next : candidate)));
              return (
                <div
                  key={`${item.field}-${index}`}
                  data-dragging={dragIndex === index || undefined}
                  onDragOver={(event) => {
                    if (dragIndex !== undefined) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => drop(event, index)}
                >
                  <button
                    type="button"
                    className="a-entity-list__sort-grip"
                    draggable
                    aria-label={intl.message("collection.sort.drag", { index: index + 1 })}
                    title={intl.message("collection.sort.dragHint")}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDragIndex(index);
                    }}
                    onDragEnd={() => setDragIndex(undefined)}
                  >
                    <GripVerticalIcon size={18} />
                  </button>
                  <span
                    className="a-entity-list__sort-order"
                    aria-label={intl.message("collection.sort.priority", { index: index + 1 })}
                  >
                    {index + 1}
                  </span>
                  <div className="a-entity-list__sort-field">
                    {renderField ? (
                      renderField({
                        label: intl.message("list.sort.fieldFor", { index: index + 1 }),
                        fields: available,
                        value: item.field,
                        onChange: (field) => replace({ ...item, field }),
                      })
                    ) : (
                      <ChoiceSelect
                        label={intl.message("list.sort.fieldFor", { index: index + 1 })}
                        value={item.field}
                        options={available.map((field) => ({ value: field.key, label: field.label }))}
                        onChange={(field) => replace({ ...item, field })}
                      />
                    )}
                  </div>
                  <SegmentedControl
                    className="a-entity-list__sort-direction"
                    label={intl.message("list.sort.directionFor", { index: index + 1 })}
                    value={item.direction}
                    options={[
                      { value: "asc", label: choice(keys.asc, "list.sort.ascending") },
                      { value: "desc", label: choice(keys.desc, "list.sort.descending") },
                    ]}
                    onValueChange={(direction) => replace({ ...item, direction })}
                  />
                  <CollectionReorderMenu
                    item={intl.message("list.sort.level", { index: index + 1 })}
                    index={index}
                    count={draft.length}
                    onMove={(target) => onDraftChange(move(draft, index, target))}
                    onRemove={() => onDraftChange(draft.filter((_, at) => at !== index))}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="a-entity-list__sort-empty">
            <span aria-hidden="true">
              <SortIcon />
            </span>
            <strong>{intl.message("collection.sort.emptyTitle")}</strong>
            <p>{intl.message("collection.sort.emptyDetail")}</p>
          </div>
        )}
        {renderAdd ? (
          renderAdd({
            label: intl.message("list.sort.addLevel", { count: draft.length, max: maximum }),
            count: draft.length,
            maximum,
            add: (key) => {
              if (draft.length < maximum && !draft.some((item) => item.field === key))
                onDraftChange([...draft, { field: key, direction: "asc" }]);
            },
            remove: (key) => onDraftChange(draft.filter((item) => item.field !== key)),
          })
        ) : (
        <Menu>
          <MenuTrigger
            variant="secondary"
            className="a-button--small a-entity-list__sort-add"
            disabled={draft.length >= maximum || !remaining.length}
          >
            <PlusIcon size={16} />
            {intl.message("list.sort.addLevel", { count: draft.length, max: maximum })}
          </MenuTrigger>
          <MenuContent portal>
            {remaining.map((field) => (
              <MenuItem key={field.key} onClick={() => onDraftChange([...draft, { field: field.key, direction: "asc" }])}>
                {field.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        )}
      </Drawer.Body>
      {footer}
    </>
  );
}

/** One grouping field, presentation only. */
export function CollectionGroupEditor({
  fields,
  value,
  onChange,
  footer,
  fieldSelect,
}: {
  /** Groupable fields only. */
  readonly fields: readonly Field[];
  readonly value?: string;
  readonly onChange: (group?: string) => void;
  readonly footer: ReactNode;
  /** A richer, clearable field picker (entity lists); defaults to ChoiceSelect with "No grouping". */
  readonly fieldSelect?: ReactNode;
}) {
  const intl = useEntityI18n();
  return (
    <>
      <Drawer.Body>
        {fields.length ? (
          <div className="a-entity-list__group-settings">
            <div className="a-label">
              <span aria-hidden="true">{intl.message("collection.group.field")}</span>
              {fieldSelect ?? <ChoiceSelect
                label={intl.message("collection.group.field")}
                value={value ?? ""}
                options={[
                  { value: "", label: intl.message("collection.group.none") },
                  ...fields.map((field) => ({ value: field.key, label: field.label })),
                ]}
                onChange={(key) => onChange(key || undefined)}
              />}
            </div>
            <p>{intl.message("collection.group.note")}</p>
          </div>
        ) : (
          <div className="a-entity-list__dialog-empty">{intl.message("collection.group.empty")}</div>
        )}
      </Drawer.Body>
      {footer}
    </>
  );
}

export type CollectionDensity = "compact" | "comfortable" | "spacious";

/** Density for this collection: follow the app (Utilities) or choose one. */
export function CollectionDensitySettings({
  appDensity,
  follow,
  onFollowChange,
  density,
  onDensityChange,
  footer,
  children,
  after,
  showFollow = true,
  densityDisabled = false,
  hideDensity = false,
}: {
  readonly appDensity: CollectionDensity;
  readonly follow: boolean;
  readonly onFollowChange: (follow: boolean) => void;
  readonly density: CollectionDensity;
  readonly onDensityChange: (density: CollectionDensity) => void;
  readonly footer: ReactNode;
  /** Settings shown before density (entity lists: layout). */
  readonly children?: ReactNode;
  /** Settings shown after density (entity lists: search behaviour). */
  readonly after?: ReactNode;
  /** Hosts that fix density (configured lookups) hide "Use app density". */
  readonly showFollow?: boolean;
  readonly densityDisabled?: boolean;
  /** Narrow lists show cards, where density does not apply. */
  readonly hideDensity?: boolean;
}) {
  const intl = useEntityI18n();
  return (
    <>
      <Drawer.Body>
        <div className="a-entity-list__view-options">
          {children}
          {hideDensity ? null : (
          <div className="a-label">
            <span aria-hidden="true">{intl.message("list.display.density")}</span>
            {showFollow ? (
            <label className="a-entity-list__follow-app">
              <Checkbox checked={follow} onChange={(event) => onFollowChange(event.currentTarget.checked)} />
              <span>
                {intl.message("list.density.followApp", { density: intl.message(`list.density.${appDensity}`) })}
                <small>{intl.message("list.density.followAppHint")}</small>
              </span>
            </label>
            ) : null}
            <SegmentedControl
              label={intl.message("list.display.density")}
              value={showFollow && follow ? appDensity : density}
              disabled={(showFollow && follow) || densityDisabled}
              options={(["compact", "comfortable", "spacious"] as const).map((item) => ({
                value: item,
                label: intl.message(`list.density.${item}`),
              }))}
              onValueChange={onDensityChange}
            />
          </div>
          )}
          {after}
        </div>
      </Drawer.Body>
      {footer}
    </>
  );
}

/** A saved view as the Views section shows it. */
export interface CollectionViewRow {
  readonly id: string;
  readonly name: string;
  /** "local" views live only in this browser and can be saved to the account. */
  readonly scope: "system" | "personal" | "shared" | "local";
  readonly compatible?: boolean;
  /** The published configuration itself ("System default"). */
  readonly published?: boolean;
  readonly personalDefault?: boolean;
  readonly sharedDefault?: boolean;
}

/** Available views (standard, mine, shared) and saving the current configuration.
 * Each action appears only when the host supplies it, so nothing is a placeholder. */
export function CollectionViewsManager({
  rows,
  currentId,
  busy = false,
  message,
  createShared = false,
  manageShared = false,
  saveSummary,
  onApply,
  onSave,
  onMakeDefault,
  onSetSharedDefault,
  onCopy,
  onRename,
  onUpdate,
  onDelete,
  onSaveLocal,
  extra,
  nameInputId = "collection-view-name",
}: {
  readonly rows: readonly CollectionViewRow[];
  readonly currentId?: string;
  readonly busy?: boolean;
  readonly message?: ReactNode;
  readonly createShared?: boolean;
  readonly manageShared?: boolean;
  /** What a saved view includes for this collection. */
  readonly saveSummary: string;
  /** Applies a view; undefined returns to the system default. */
  readonly onApply: (id?: string) => void;
  readonly onSave?: (name: string, visibility: "personal" | "shared") => void | Promise<unknown>;
  readonly onMakeDefault?: (id: string) => void;
  readonly onSetSharedDefault?: (id: string) => void;
  readonly onCopy?: (id: string) => void;
  readonly onRename?: (id: string, name: string) => Promise<boolean>;
  readonly onUpdate?: (id: string) => void;
  readonly onDelete?: (id: string) => void;
  readonly onSaveLocal?: (id: string) => void;
  /** Collection-specific notes (for example views to import from this browser). */
  readonly extra?: ReactNode;
  /** Id of the view-name field. */
  readonly nameInputId?: string;
}) {
  const intl = useEntityI18n();
  const text = (key: string, values?: Record<string, string | number>) => intl.message(`collection.views.${key}`, values);
  const [tab, setTab] = useState("available"),
    [name, setName] = useState(""),
    [visibility, setVisibility] = useState<"personal" | "shared">("personal"),
    [renaming, setRenaming] = useState<string>(),
    [renameValue, setRenameValue] = useState("");
  const sections = [
    { label: text("standard"), items: rows.filter((view) => view.scope === "system") },
    { label: text("mine"), items: rows.filter((view) => view.scope === "personal" || view.scope === "local") },
    { label: text("shared"), items: rows.filter((view) => view.scope === "shared") },
  ];
  return (
    <>
      <Drawer.Tabs value={tab} onValueChange={setTab}>
        <Drawer.TabList aria-label={text("sections")}>
          <Drawer.Tab value="available">{text("available")}</Drawer.Tab>
          {onSave ? <Drawer.Tab value="save">{text("saveCurrent")}</Drawer.Tab> : null}
        </Drawer.TabList>
        <Drawer.Body className="a-entity-list__view-dialog">
          <div hidden={tab !== "save"} inert={tab !== "save"}>
            <section>
              <h3>{text("saveCurrent")}</h3>
              <Label htmlFor={nameInputId}>{text("name")}</Label>
              <div className="a-entity-list__save-view">
                <Input
                  id={nameInputId}
                  value={name}
                  maxLength={160}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder={text("namePlaceholder")}
                />
              </div>
              {createShared ? (
                <div className="a-label">
                  <span aria-hidden="true">{text("visibility")}</span>
                  <SegmentedControl
                    label={text("visibility")}
                    value={visibility}
                    options={[
                      { value: "personal", label: text("personal") },
                      { value: "shared", label: text("sharedTenant") },
                    ]}
                    onValueChange={setVisibility}
                  />
                </div>
              ) : (
                <p className="a-entity-list__view-summary">{text("personalOnly")}</p>
              )}
              <p className="a-entity-list__view-summary">{saveSummary}</p>
            </section>
          </div>
          <div hidden={tab !== "available"} inert={tab !== "available"}>
            {sections.map((section) => (
              <section key={section.label}>
                <h3>{section.label}</h3>
                {!section.items.length ? (
                  <p className="a-entity-list__view-summary">
                    {intl.message("list.emptyEntity", { entity: section.label })}
                  </p>
                ) : (
                  <div className="a-entity-list__saved-views">
                    {section.items.map((view) => {
                      const active = (currentId ?? "system") === view.id,
                        unavailable = view.compatible === false,
                        writable =
                          view.scope === "personal" || (view.scope === "shared" && manageShared);
                      const kind =
                        view.scope === "system"
                          ? view.published
                            ? text("published")
                            : text("standardView")
                          : view.scope === "local"
                            ? text("browser")
                            : view.scope === "shared"
                              ? text("sharedTenant")
                              : text("personal");
                      return (
                        <div key={view.id} className="a-entity-list__saved-view-row" data-current={active || undefined}>
                          <button
                            type="button"
                            aria-current={active ? "true" : undefined}
                            onClick={() => onApply(view.published ? undefined : view.id)}
                            disabled={busy || unavailable}
                          >
                            <strong>
                              {view.name}
                              {unavailable ? ` · ${text("unavailable")}` : ""}
                              {active ? (
                                <Badge className="a-entity-list__view-current">{intl.message("list.views.current")}</Badge>
                              ) : null}
                            </strong>
                            <small>
                              {kind}
                              {view.personalDefault ? ` · ${text("myDefault")}` : ""}
                              {view.sharedDefault ? ` · ${text("tenantDefault")}` : ""}
                            </small>
                          </button>
                          <div className="a-entity-list__view-row-actions">
                            {onMakeDefault && view.scope !== "local" ? (
                              <Button
                                size="small"
                                variant="ghost"
                                disabled={busy || unavailable || view.personalDefault}
                                onClick={() => onMakeDefault(view.id)}
                              >
                                {text("makeDefault")}
                              </Button>
                            ) : null}
                            {onSetSharedDefault && (view.scope === "system" || view.scope === "shared") ? (
                              <Button
                                size="small"
                                variant="ghost"
                                disabled={busy || unavailable || view.sharedDefault}
                                onClick={() => onSetSharedDefault(view.id)}
                              >
                                {text("setTenantDefault")}
                              </Button>
                            ) : null}
                            {onCopy && view.scope === "shared" ? (
                              <Button size="small" variant="ghost" disabled={busy} onClick={() => onCopy(view.id)}>
                                {text("copy")}
                              </Button>
                            ) : null}
                            {writable ? (
                              <>
                                {onRename ? (
                                  <Button
                                    size="small"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => {
                                      setRenaming(view.id);
                                      setRenameValue(view.name);
                                    }}
                                  >
                                    {text("rename")}
                                  </Button>
                                ) : null}
                                {onUpdate ? (
                                  <Button size="small" variant="ghost" disabled={busy} onClick={() => onUpdate(view.id)}>
                                    {text("update")}
                                  </Button>
                                ) : null}
                                {onDelete ? (
                                  <Button size="small" variant="ghost" disabled={busy} onClick={() => onDelete(view.id)}>
                                    {text("delete")}
                                  </Button>
                                ) : null}
                              </>
                            ) : null}
                            {onSaveLocal && view.scope === "local" ? (
                              <Button size="small" variant="ghost" disabled={busy} onClick={() => onSaveLocal(view.id)}>
                                {text("saveToAccount")}
                              </Button>
                            ) : null}
                          </div>
                          {renaming === view.id && onRename ? (
                            <div className="a-entity-list__save-view">
                              <Input
                                aria-label={text("newName", { name: view.name })}
                                value={renameValue}
                                maxLength={160}
                                onChange={(event) => setRenameValue(event.currentTarget.value)}
                              />
                              <Button
                                size="small"
                                disabled={busy || !renameValue.trim()}
                                onClick={() =>
                                  void onRename(view.id, renameValue.trim()).then((done) => {
                                    if (done) setRenaming(undefined);
                                  })
                                }
                              >
                                {text("saveName")}
                              </Button>
                              <Button size="small" variant="ghost" onClick={() => setRenaming(undefined)}>
                                {text("cancel")}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
            {extra}
          </div>
          {message ? <p role="status">{message}</p> : null}
          <p className="a-entity-list__view-summary">{text("resetNote")}</p>
        </Drawer.Body>
      </Drawer.Tabs>
      <Drawer.Footer>
        <Drawer.FooterActions>
          <Button variant="ghost" size="small" disabled={busy} onClick={() => onApply()}>
            {text("reset")}
          </Button>
          {tab === "save" && onSave ? (
            <Button
              size="small"
              disabled={busy || !name.trim()}
              onClick={() =>
                void Promise.resolve(onSave(name.trim(), createShared ? visibility : "personal")).then(() => {
                  setName("");
                  setTab("available");
                })
              }
            >
              {text("save")}
            </Button>
          ) : null}
        </Drawer.FooterActions>
      </Drawer.Footer>
    </>
  );
}
