import type { RedisClient } from "@athyper/adapter-memory-cache";

type Listener = (payload: string) => void;

type FanoutState = {
  subscriber?: RedisClient;
  channels: Map<string, Set<Listener>>;
  starting?: Promise<void>;
};

const states = new WeakMap<RedisClient, FanoutState>();

function stateFor(redis: RedisClient): FanoutState {
  let state = states.get(redis);
  if (!state) {
    state = { channels: new Map() };
    states.set(redis, state);
  }
  return state;
}

/**
 * One Redis subscriber per API process, regardless of connected SSE clients.
 * PostgreSQL remains the durable source of truth; this layer only wakes the
 * per-request bounded drain when a record event is published.
 */
export async function subscribeRecordSse(
  redis: RedisClient,
  channel: string,
  listener: Listener,
): Promise<() => void> {
  const state = stateFor(redis);
  let listeners = state.channels.get(channel);
  if (!listeners) {
    listeners = new Set();
    state.channels.set(channel, listeners);
  }
  listeners.add(listener);

  if (!state.subscriber) {
    state.subscriber = redis.duplicate();
    state.subscriber.on("message", (receivedChannel, payload) => {
      for (const callback of state.channels.get(receivedChannel) ?? []) callback(payload);
    });
  }
  if (!state.starting) {
    state.starting = state.subscriber.subscribe(channel).then(() => undefined).finally(() => {
      state.starting = undefined;
    });
  } else if (state.channels.size > 0) {
    await state.starting;
    if (state.subscriber && !(state.subscriber as RedisClient & { subscribed?: Set<string> }).subscribed) {
      await state.subscriber.subscribe(channel);
    }
  }
  await state.starting;

  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const current = state.channels.get(channel);
    current?.delete(listener);
    if (current?.size === 0) {
      state.channels.delete(channel);
      void state.subscriber?.unsubscribe(channel).catch(() => undefined);
    }
  };
}

export function closeRecordSseFanout(redis: RedisClient): void {
  const state = states.get(redis);
  if (!state) return;
  state.channels.clear();
  try { state.subscriber?.disconnect(); } catch { /* process shutdown */ }
  state.subscriber = undefined;
}
