"use client";

import {
  activityHref,
  collectionActivityQuery,
  activityCollectionState,
  type ActivityCollectionSnapshot,
  type ActivitySavedViews,
  defaultActivityQuery,
  parseActivityQuery,
  type ActivityKind,
  type ActivityQuery,
} from "@athyper/contract-platform-activity";
import {
  ApiTransportError,
  createOperation,
  type HttpClient,
} from "@athyper/platform-api-client";
import {
  consumeNotificationStream,
  createNotificationClient,
  type NotificationItem,
} from "@athyper/platform-communications-notifications-client";
import type {
  ShellActivityDataSource,
  ShellInboxItem,
  ShellNotificationItem,
  ShellNotificationTone,
  ShellPushEnrollmentStatus,
} from "@athyper/platform-shell";
import {
  createWorkInboxClient,
  type WorkItem,
} from "@athyper/platform-shell-work-inbox";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ActivityCenterOptions {
  readonly client: HttpClient;
  readonly locale?: string;
  readonly notificationLimit?: number;
  readonly inboxLimit?: number;
}
const ActivityCenterContext = createContext<
  ShellActivityDataSource | undefined
>(undefined);
const PUSH_DEVICE_ID_KEY = "athyper.notifications.device-id",
  PUSH_SUBSCRIPTION_ID_KEY = "athyper.notifications.push-subscription-id";
export function ActivityCenterDataProvider({
  value,
  children,
}: {
  readonly value: ShellActivityDataSource;
  readonly children: ReactNode;
}) {
  return createElement(ActivityCenterContext.Provider, { value }, children);
}
export function useActivityCenterData(): ShellActivityDataSource {
  const value = useContext(ActivityCenterContext);
  if (!value)
    throw new Error(
      "useActivityCenterData must be used inside ActivityCenterDataProvider",
    );
  return value;
}

export function useActivityCenterDataSource({
  client,
  locale = "en",
  notificationLimit = 50,
  inboxLimit = 50,
}: ActivityCenterOptions): ShellActivityDataSource {
  const notificationsClient = useMemo(
      () => createNotificationClient(client),
      [client],
    ),
    inboxClient = useMemo(() => createWorkInboxClient(client), [client]);
  const [queries, setQueries] = useState<Record<ActivityKind, ActivityQuery>>(
    () => ({
      notifications: defaultActivityQuery("notifications"),
      inbox: defaultActivityQuery("inbox"),
    }),
  );
  const [collectionRevision,setCollectionRevision]=useState(0);
  const [collections,setCollections]=useState<Partial<Record<ActivityKind,ActivityCollectionSnapshot>>>({});
  const [savedViews,setSavedViews]=useState<Partial<Record<ActivityKind,ActivitySavedViews>>>({});
  const [collectionErrors,setCollectionErrors]=useState<Partial<Record<ActivityKind,string>>>({});
  const [collectionsReady,setCollectionsReady]=useState(false);
  useEffect(()=>{const abort=new AbortController();setCollectionsReady(false);
    void Promise.allSettled((["notifications","inbox"] as const).map(async kind=>{
      const snapshot=await client.request(createOperation<ActivityCollectionSnapshot>({method:"GET",path:`/api/collections/activity.${kind}/descriptor`}),{signal:abort.signal});
      const views=await client.request(createOperation<ActivitySavedViews>({method:"GET",path:`/api/collections/activity.${kind}/views`}),{signal:abort.signal});
      return {kind,snapshot,views};
    })).then(results=>{if(abort.signal.aborted)return;const next:typeof collections={},views:typeof savedViews={},failures:typeof collectionErrors={};results.forEach((result,i)=>{const kind=i===0?"notifications":"inbox";if(result.status==="fulfilled"){next[kind]=result.value.snapshot;views[kind]=result.value.views;}else failures[kind]=activityError(result.reason);});setCollections(next);setSavedViews(views);setCollectionErrors(failures);setCollectionsReady(true);});
    return ()=>abort.abort();
  },[client,collectionRevision]);
  const onViewCommand=useCallback(async(kind:ActivityKind,command:Record<string,unknown>)=>{const result=command.action==="reload"?await client.request(createOperation<ActivitySavedViews>({method:"GET",path:`/api/collections/activity.${kind}/views`})):await client.request(createOperation<ActivitySavedViews,Record<string,unknown>>({method:"POST",path:`/api/collections/activity.${kind}/views`}),{body:command});setSavedViews(v=>({...v,[kind]:result}));return result;},[client]);
  const onPreviewQuery=useCallback(async(kind:ActivityKind,query:ActivityQuery,signal?:AbortSignal)=>{const result=kind==="notifications"?await notificationsClient.list({limit:1,activityQuery:JSON.stringify(query),signal}):await inboxClient.list({limit:1,activityQuery:JSON.stringify(query),signal});return result.matchingCount??0;},[notificationsClient,inboxClient]);
  const [locationReady, setLocationReady] = useState(false);
  const [queryInfo, setQueryInfo] = useState<
    NonNullable<ShellActivityDataSource["queryInfo"]>
  >({});
  const notificationQuery = JSON.stringify(queries.notifications),
    inboxQuery = JSON.stringify(queries.inbox);
  const [notifications, setNotifications] = useState<
      readonly NotificationItem[]
    >([]),
    [workItems, setWorkItems] = useState<readonly WorkItem[]>([]),
    [notificationCursor, setNotificationCursor] = useState<string>(),
    [inboxCursor, setInboxCursor] = useState<string>(),
    [unreadCount, setUnreadCount] = useState(0),
    [openInboxCount, setOpenInboxCount] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string>(),
    [errorStatus, setErrorStatus] = useState<number>(),
    [revision, setRevision] = useState(0),
    [pushEnrollmentStatus, setPushEnrollmentStatus] =
      useState<ShellPushEnrollmentStatus>("checking"),
    [pushEnrollmentError, setPushEnrollmentError] = useState<string>();
  const [errors, setErrors] = useState<ShellActivityDataSource["errors"]>({});
  const generation = useRef(0),
    notificationPages = useRef(1),
    inboxPages = useRef(1),
    moreBusy = useRef({ notifications: false, inbox: false }),
    initialized = useRef(false);
  const changeQuery = useCallback(
    (kind: ActivityKind, query: ActivityQuery) => {
      if(collections[kind])setCollectionErrors(current=>{const next={...current};delete next[kind];return next;});
      generation.current++;
      notificationPages.current = 1;
      inboxPages.current = 1;
      initialized.current = false;
      setNotificationCursor(undefined);
      setInboxCursor(undefined);
      setNotifications([]);
      setWorkItems([]);
      setLoading(true);
      setQueries((current) => ({ ...current, [kind]: query }));
      setRevision((value) => value + 1);
      if (window.location.pathname === `/${kind}`)
        window.history.pushState(
          window.history.state,
          "",
          activityHref(kind, query),
        );
    },
    [collections],
  );
  useEffect(() => {
    if(!collectionsReady)return;
    const restore = () => {
      generation.current++;
      notificationPages.current = 1;
      inboxPages.current = 1;
      initialized.current = false;
      setNotifications([]);
      setWorkItems([]);
      setNotificationCursor(undefined);
      setInboxCursor(undefined);
      const restored=readLocationQueries((kind,message)=>setCollectionErrors(current=>({...current,[kind]:message})));
      const params=new URLSearchParams(window.location.search);
      for(const kind of ["notifications","inbox"] as const){const c=collections[kind]?.configuration;if(!c)continue;
        if(window.location.pathname===`/${kind}`&&(params.has("activityQuery")||params.has("activityFilter"))){try{restored[kind]=collectionActivityQuery(kind,activityCollectionState(kind,restored[kind],c),restored[kind].timeZone);}catch{setCollectionErrors(e=>({...e,[kind]:"This bookmarked view is incompatible. Reset it to use current fields."}));}continue;}
        const views=savedViews[kind],preferred=views?.personalDefault??views?.sharedDefault,view=views?.views.find(v=>v.id===preferred&&v.compatible);
        restored[kind]=collectionActivityQuery(kind,view?.state.collection??c.defaultState,restored[kind].timeZone);
      }
      setQueries(restored);
      setRevision((value) => value + 1);
    };
    restore();
    setLocationReady(true);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [collectionsReady,collections]);
  const pushPublicKey = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!locationReady) return;
    const controller = new AbortController();
    const epoch = ++generation.current;
    moreBusy.current = { notifications: false, inbox: false };
    setLoading(!initialized.current);
    setError(undefined);
    setErrorStatus(undefined);
    const readNotifications = async () => {
      if(collectionErrors.notifications)throw new Error(collectionErrors.notifications);
      let cursor: string | undefined,
        items: NotificationItem[] = [],
        unreadCount = 0;
      let info: NonNullable<
        ShellActivityDataSource["queryInfo"]
      >["notifications"];
      for (let i = 0; i < notificationPages.current; i++) {
        const page = await notificationsClient.list({
          limit: Math.min(notificationLimit,collections.notifications?.configuration.maxPageSize??notificationLimit),
          activityQuery: notificationQuery,
          cursor,
          signal: controller.signal,
        });
        items.push(...page.notifications);
        unreadCount = page.unreadCount;
        info = {
          matchingCount: page.matchingCount,
          facets: page.facets,
          viewScope: page.viewScope,
        };
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      return { notifications: items, unreadCount, nextCursor: cursor, info };
    };
    const readInbox = async () => {
      if(collectionErrors.inbox)throw new Error(collectionErrors.inbox);
      let cursor: string | undefined,
        items: WorkItem[] = [],
        totalCount = 0;
      let info: NonNullable<ShellActivityDataSource["queryInfo"]>["inbox"];
      for (let i = 0; i < inboxPages.current; i++) {
        const page = await inboxClient.list({
          limit: Math.min(inboxLimit,collections.inbox?.configuration.maxPageSize??inboxLimit),
          activityQuery: inboxQuery,
          cursor,
          statuses: ["open", "claimed", "in_progress", "blocked"],
          signal: controller.signal,
        });
        items.push(...page.data);
        totalCount = page.totalCount;
        info = {
          matchingCount: page.matchingCount,
          facets: page.facets,
          viewScope: page.viewScope,
        };
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      return { data: items, totalCount, nextCursor: cursor, info };
    };
    Promise.allSettled([readNotifications(), readInbox()]).then(
      ([notificationResult, inboxResult]) => {
        if (controller.signal.aborted || epoch !== generation.current) return;
        const failures: NonNullable<ShellActivityDataSource["errors"]> = {};
        if (notificationResult.status === "fulfilled") {
          const page = notificationResult.value;
          setNotifications(page.notifications);
          setQueryInfo((current) => ({ ...current, notifications: page.info }));
          setNotificationCursor(page.nextCursor);
          setUnreadCount(page.unreadCount);
        } else {
          setNotifications([]);
          setNotificationCursor(undefined);
          setUnreadCount(0);
          const e = notificationResult.reason;
          failures.notifications = {
            message: activityError(e),
            ...(e instanceof ApiTransportError ? { status: e.status } : {}),
          };
        }
        if (inboxResult.status === "fulfilled") {
          const page = inboxResult.value;
          setWorkItems(page.data);
          setQueryInfo((current) => ({ ...current, inbox: page.info }));
          setInboxCursor(page.nextCursor);
          setOpenInboxCount(page.totalCount);
        } else {
          setWorkItems([]);
          setInboxCursor(undefined);
          setOpenInboxCount(0);
          const e = inboxResult.reason;
          failures.inbox = {
            message: activityError(e),
            ...(e instanceof ApiTransportError ? { status: e.status } : {}),
          };
        }
        initialized.current = true;
        setErrors(failures);
        setLoading(false);
      },
    );
    return () => controller.abort();
  }, [
    notificationsClient,
    inboxClient,
    notificationLimit,
    collections,
    inboxLimit,
    revision,
    notificationQuery,
    inboxQuery,
    locationReady,
    collectionErrors,
  ]);
  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined,
      attempt = 0;
    const connect = async () => {
      try {
        const stream = await notificationsClient.stream(controller.signal);
        attempt = 0;
        await consumeNotificationStream(stream, refresh, controller.signal);
      } catch {
        if (controller.signal.aborted) return;
      }
      if (!controller.signal.aborted) {
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5));
        reconnectTimer = setTimeout(() => void connect(), delay);
      }
    };
    void connect();
    const poll = setInterval(refresh, 60_000);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearInterval(poll);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [notificationsClient, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    const inspect = async () => {
      if (!supportsWebPush()) {
        setPushEnrollmentStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setPushEnrollmentStatus("denied");
        return;
      }
      try {
        const configuration = await notificationsClient.pushConfiguration(
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (
          !configuration.webPush.available ||
          !configuration.webPush.publicKey
        ) {
          setPushEnrollmentStatus("unavailable");
          return;
        }
        pushPublicKey.current = configuration.webPush.publicKey;
        const registration = await navigator.serviceWorker.getRegistration("/"),
          subscription = await registration?.pushManager.getSubscription(),
          serverId = localStorage.getItem(PUSH_SUBSCRIPTION_ID_KEY);
        if (controller.signal.aborted) return;
        setPushEnrollmentStatus(
          subscription && serverId ? "enabled" : "prompt",
        );
      } catch (cause: unknown) {
        if (controller.signal.aborted) return;
        setPushEnrollmentError(activityError(cause));
        setPushEnrollmentStatus("error");
      }
    };
    void inspect();
    return () => controller.abort();
  }, [notificationsClient]);

  const markRead = useCallback(
    async (item: ShellNotificationItem) => {
      const current = notifications.find((value) => value.id === item.id);
      if (!current || current.readAt) return;
      const readAt = new Date().toISOString();
      setNotifications((items) =>
        items.map((value) =>
          value.id === item.id ? { ...value, readAt } : value,
        ),
      );
      setUnreadCount((value) => Math.max(0, value - 1));
      try {
        await notificationsClient.markRead(item.id);
        if (mounted.current) refresh();
      } catch {
        if (mounted.current) refresh();
        throw new Error("Could not mark notification read");
      }
    },
    [notifications, notificationsClient, refresh],
  );
  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    setNotifications((items) =>
      items.map((value) => (value.readAt ? value : { ...value, readAt })),
    );
    setUnreadCount(0);
    try {
      await notificationsClient.markAllRead();
    } catch {
      if (mounted.current) refresh();
      throw new Error("Could not update notifications");
    }
  }, [notificationsClient, refresh]);
  const dismiss = useCallback(
    async (item: ShellNotificationItem) => {
      await notificationsClient.dismiss(item.id);
      if (!mounted.current) return;
      setNotifications((items) =>
        items.filter((value) => value.id !== item.id),
      );
      refresh();
    },
    [notificationsClient, refresh],
  );
  const loadMoreNotifications = useCallback(async () => {
    if (!notificationCursor || moreBusy.current.notifications) return;
    const epoch = generation.current;
    moreBusy.current.notifications = true;
    try {
      const page = await notificationsClient.list({
        limit: Math.min(notificationLimit,collections.notifications?.configuration.maxPageSize??notificationLimit),
        activityQuery: notificationQuery,
        cursor: notificationCursor,
      });
      if (!mounted.current || epoch !== generation.current) return;
      notificationPages.current++;
      setNotifications((items) => mergeById(items, page.notifications));
      setNotificationCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
      setQueryInfo((current) => ({
        ...current,
        notifications: {
          matchingCount: page.matchingCount,
          facets: page.facets,
          viewScope: page.viewScope,
        },
      }));
    } finally {
      if (epoch === generation.current) moreBusy.current.notifications = false;
    }
  }, [
    notificationCursor,
    notificationsClient,
    notificationLimit,
    collections,
    notificationQuery,
  ]);
  const loadMoreInbox = useCallback(async () => {
    if (!inboxCursor || moreBusy.current.inbox) return;
    const epoch = generation.current;
    moreBusy.current.inbox = true;
    try {
      const page = await inboxClient.list({
        limit: Math.min(inboxLimit,collections.inbox?.configuration.maxPageSize??inboxLimit),
        activityQuery: inboxQuery,
        cursor: inboxCursor,
        statuses: ["open", "claimed", "in_progress", "blocked"],
      });
      if (!mounted.current || epoch !== generation.current) return;
      inboxPages.current++;
      setWorkItems((items) => mergeById(items, page.data));
      setInboxCursor(page.nextCursor);
      setOpenInboxCount(page.totalCount);
      setQueryInfo((current) => ({
        ...current,
        inbox: {
          matchingCount: page.matchingCount,
          facets: page.facets,
          viewScope: page.viewScope,
        },
      }));
    } finally {
      if (epoch === generation.current) moreBusy.current.inbox = false;
    }
  }, [inboxCursor, inboxClient, inboxLimit, inboxQuery]);
  const enableBrowserPush = useCallback(async () => {
    if (!supportsWebPush()) {
      setPushEnrollmentStatus("unsupported");
      return;
    }
    setPushEnrollmentError(undefined);
    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setPushEnrollmentStatus(permission === "denied" ? "denied" : "prompt");
        return;
      }
      let publicKey = pushPublicKey.current;
      if (!publicKey) {
        const configuration = await notificationsClient.pushConfiguration();
        publicKey = configuration.webPush.publicKey;
        if (!configuration.webPush.available || !publicKey) {
          setPushEnrollmentStatus("unavailable");
          return;
        }
        pushPublicKey.current = publicKey;
      }
      const applicationServerKey = decodeVapidPublicKey(publicKey);
      const registration = await navigator.serviceWorker.register(
        "/notification-sw.js",
        { scope: "/" },
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));
      const serialized = subscription.toJSON(),
        record = await notificationsClient.subscribePush({
          platform: "web",
          deviceId: pushDeviceId(),
          endpoint: subscription.endpoint,
          ...(serialized.keys?.p256dh
            ? { p256dhKey: serialized.keys.p256dh }
            : {}),
          ...(serialized.keys?.auth ? { authKey: serialized.keys.auth } : {}),
        });
      localStorage.setItem(PUSH_SUBSCRIPTION_ID_KEY, record.id);
      setPushEnrollmentStatus("enabled");
    } catch (cause: unknown) {
      setPushEnrollmentError(activityError(cause));
      setPushEnrollmentStatus("error");
    }
  }, [notificationsClient]);
  const disableBrowserPush = useCallback(async () => {
    setPushEnrollmentError(undefined);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/"),
        subscription = await registration?.pushManager.getSubscription(),
        serverId = localStorage.getItem(PUSH_SUBSCRIPTION_ID_KEY);
      if (subscription) await subscription.unsubscribe();
      if (serverId) await notificationsClient.unsubscribePush(serverId);
      localStorage.removeItem(PUSH_SUBSCRIPTION_ID_KEY);
      setPushEnrollmentStatus(
        Notification.permission === "denied" ? "denied" : "prompt",
      );
    } catch (cause: unknown) {
      setPushEnrollmentError(activityError(cause));
      setPushEnrollmentStatus("error");
    }
  }, [notificationsClient]);
  return useMemo(
    () => ({
      notifications: notifications.map((item) => ({
        ...toShellNotification(item, locale),
        ...(!collections.notifications?.configuration.actionKeys.includes("open_record")?{href:undefined}:{}),
        ...(queries.notifications.group === "none" ? { groupLabel: "" } : {}),
      })),
      inbox: workItems.map((item) => ({
        ...toShellInbox(item, locale),
        ...(!collections.inbox?.configuration.actionKeys.some(key=>key==="open_record"||key==="open_task")?{href:undefined}:{}),
        ...(queries.inbox.group === "none" ? { groupLabel: "" } : {}),
      })),
      queries,
      collections,savedViews,collectionErrors,onViewCommand,onPreviewQuery,
      queryInfo,
      onQueryChange: changeQuery,
      unreadNotificationCount: unreadCount,
      openInboxCount,
      hasMoreNotifications: Boolean(notificationCursor),
      hasMoreInbox: Boolean(inboxCursor),
      loading,
      error,
      errorStatus,
      errors,
      pushEnrollmentStatus,
      pushEnrollmentError,
      notificationsHref: activityHref("notifications", queries.notifications),
      inboxHref: activityHref("inbox", queries.inbox),
      onRetry: ()=>{setCollectionRevision(v=>v+1);refresh();},
      onMarkNotificationRead: collections.notifications?.configuration.actionKeys.includes("mark_read")?markRead:undefined,
      onMarkAllNotificationsRead: collections.notifications?.configuration.actionKeys.includes("mark_read")?markAllRead:undefined,
      onDismissNotification: collections.notifications?.configuration.actionKeys.includes("dismiss")?dismiss:undefined,
      onLoadMoreNotifications: loadMoreNotifications,
      onLoadMoreInbox: loadMoreInbox,
      onEnableBrowserPush: enableBrowserPush,
      onDisableBrowserPush: disableBrowserPush,
    }),
    [
      notifications,
      queries,
      collections,savedViews,collectionErrors,onViewCommand,onPreviewQuery,
      queryInfo,
      changeQuery,
      workItems,
      notificationCursor,
      inboxCursor,
      unreadCount,
      openInboxCount,
      loading,
      error,
      errorStatus,
      errors,
      pushEnrollmentStatus,
      pushEnrollmentError,
      locale,
      refresh,
      markRead,
      markAllRead,
      dismiss,
      loadMoreNotifications,
      loadMoreInbox,
      enableBrowserPush,
      disableBrowserPush,
    ],
  );
}

function toShellNotification(
  item: NotificationItem,
  locale: string,
): ShellNotificationItem {
  return Object.freeze({
    id: item.id,
    title: item.title,
    recordLabel: item.recordLabel,
    actionLabel: item.actionLabel,
    ...(item.body ? { detail: item.body } : {}),
    sourceLabel: sourceLabel(item.eventCode),
    groupLabel: item.groupLabel ?? dateGroup(item.createdAt, locale),
    timestamp: item.createdAt,
    timestampLabel: relativeTime(item.createdAt, locale),
    ...(safeHref(item.href) ? { href: item.href } : {}),
    unread: !item.readAt,
    tone: tone(item),
  });
}
function toShellInbox(item: WorkItem, locale: string): ShellInboxItem {
  const href = safeHref(item.href) ? item.href : undefined;
  return Object.freeze({
    id: item.id,
    title: item.title,
    recordLabel: item.recordLabel,
    actionLabel: item.actionLabel,
    statusLabel: humanize(item.status),
    overdue: Boolean(item.dueAt && new Date(item.dueAt).getTime() < Date.now()),
    ...(item.description ? { detail: item.description } : {}),
    sourceLabel: humanize(item.workTypeCode),
    ...(item.assignmentLabel ? { assigneeLabel: item.assignmentLabel } : {}),
    ...(item.dueAt ? { dueLabel: dueLabel(item.dueAt, locale) } : {}),
    groupLabel:
      item.groupLabel ??
      (item.dueAt && new Date(item.dueAt).getTime() < Date.now()
        ? "Overdue"
        : "Open work"),
    ...(href ? { href } : {}),
    priority:
      item.priority === "urgent"
        ? "urgent"
        : item.priority === "high"
          ? "high"
          : "normal",
  });
}
function tone(item: NotificationItem): ShellNotificationTone {
  if (item.priority === "urgent") return "critical";
  if (item.priority === "high") return "warning";
  if (/(?:completed|approved|success|passed)/.test(item.eventCode))
    return "success";
  return "info";
}
function sourceLabel(eventCode: string): string {
  return humanize(eventCode.split(".")[0] ?? eventCode);
}
function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function safeHref(value: string | undefined): value is string {
  return Boolean(
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\"),
  );
}
function payloadHref(
  payload: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const key of ["href", "entity_href", "action_url"]) {
    const value = payload[key];
    if (typeof value === "string" && safeHref(value)) return value;
  }
  return undefined;
}
function safeLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? "en";
  } catch {
    return "en";
  }
}
function dateGroup(value: string, locale: string): string {
  const date = new Date(value),
    now = new Date(),
    start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime(),
    day = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime(),
    difference = Math.round((start - day) / 86_400_000);
  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  if (difference < 7) return "This week";
  return new Intl.DateTimeFormat(safeLocale(locale), {
    month: "long",
    year: "numeric",
  }).format(date);
}
function relativeTime(value: string, locale: string): string {
  const delta = new Date(value).getTime() - Date.now(),
    absolute = Math.abs(delta),
    formatter = new Intl.RelativeTimeFormat(safeLocale(locale), {
      numeric: "auto",
    });
  if (absolute < 60_000)
    return formatter.format(Math.round(delta / 1_000), "second");
  if (absolute < 3_600_000)
    return formatter.format(Math.round(delta / 60_000), "minute");
  if (absolute < 86_400_000)
    return formatter.format(Math.round(delta / 3_600_000), "hour");
  return formatter.format(Math.round(delta / 86_400_000), "day");
}
function dueLabel(value: string, locale: string): string {
  const delta = new Date(value).getTime() - Date.now();
  if (delta < 0)
    return `Overdue ${relativeTime(value, locale).replace(" ago", "")}`;
  return `Due ${relativeTime(value, locale)}`;
}
function activityError(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Activity is temporarily unavailable.";
}
function mergeById<T extends { readonly id: string }>(
  current: readonly T[],
  next: readonly T[],
): readonly T[] {
  const seen = new Set(current.map((item) => item.id));
  return Object.freeze([
    ...current,
    ...next.filter((item) => !seen.has(item.id)),
  ]);
}
function supportsWebPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}
export function decodeVapidPublicKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4),
    base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/"),
    bytes = atob(base64),
    result = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1)
    result[index] = bytes.charCodeAt(index);
  return result;
}
function pushDeviceId(): string {
  const current = localStorage.getItem(PUSH_DEVICE_ID_KEY);
  if (current) return current;
  const generated =
    globalThis.crypto?.randomUUID?.() ??
    `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(PUSH_DEVICE_ID_KEY, generated);
  return generated;
}

function readLocationQueries(onError?:(kind:ActivityKind,message:string)=>void): Record<ActivityKind, ActivityQuery> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const values = {
    notifications: defaultActivityQuery("notifications", timeZone),
    inbox: defaultActivityQuery("inbox", timeZone),
  };
  if (typeof window === "undefined") return values;
  const kind =
      window.location.pathname === "/inbox" ? "inbox" : "notifications",
    params = new URLSearchParams(window.location.search);
  try {
    if (params.has("activityQuery"))
      values[kind] = parseActivityQuery(kind, {
        timeZone,
        ...JSON.parse(params.get("activityQuery")!),
      });
    else if (params.get("activityFilter") === "attention") {
      if (kind === "notifications") values[kind].read = "unread";
      else values[kind].attention = true;
    }
  } catch {
    onError?.(kind,"This bookmarked query is incompatible. Reset the view to use the published settings.");
  }
  return values;
}
