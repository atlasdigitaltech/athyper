# SSE overload

Monitor connection count, Redis subscription errors, buffer/backpressure disconnects, and reconnect rate. Enforce tenant/user/record limits and allow slow clients to reconnect with `Last-Event-ID`. During Redis failure, serve bounded keepalive/catch-up behavior and do not add per-connection polling.
