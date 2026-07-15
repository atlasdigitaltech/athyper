# Meta-entity descriptor generation bump

Owner: Metadata Platform / Platform Ops.

Use this only when effective metadata is correct in PostgreSQL but replicas have not converged. Normal invalidation and manual recovery increment an exact generation; never use `SCAN`, wildcard deletion, or content-addressed payload deletion.

```text
execdesc:gen:v1:{plane}:{tenant}:{entity}
```

Choose the narrowest scope and use `__all__` only for the dimension intentionally widened:

```bash
redis-cli INCR "execdesc:gen:v1:neon:{tenant_uuid}:purchase_invoice"
redis-cli PUBLISH execdesc:invalidate:v1 \
  '{"plane":"neon","tenant":"{tenant_uuid}","entity":"purchase_invoice","reason":"manual_generation_bump","emittedAt":{epoch_ms},"origin":"ops"}'
```

Write a recovery/audit row to `log.descriptor_cache_invalidation` with the same tenant, entity, plane, and reason. The poller may increment again; monotonic generations make that safe.

Verify the first request refills L2/L1, `X-Descriptor-Hash` equals the active version, and invalidation lag is below 5 seconds healthy or 35 seconds through recovery. Record the exact key and old/new generations in the incident.
