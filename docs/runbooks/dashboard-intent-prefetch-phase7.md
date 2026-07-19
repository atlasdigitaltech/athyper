# Dashboard intent prefetch — Phase 7

Phase 7 enables metadata-governed list route prefetch only after dashboard
hover or keyboard focus. Next.js automatic viewport prefetch is disabled on
these links. Metadata policies set to `none`, `viewport`, or `eager` do not
prefetch in this phase.

## Pilot selection

`ATHYPER_DASHBOARD_PREFETCH_ENTITIES` is a comma-separated list of canonical
entity codes. The initial default pilot is `journal_entry`. A selected entity
is displayed only when its runtime descriptor exists and its effective cache
policy has an enabled mode with `prefetch: "intent"`.

## Browser measurements

The implementation emits `athyper:runtime-list-prefetch` browser events with
these stages:

- `scheduled`: hover/focus requested route prefetch.
- `deduplicated`: another intent occurred after the request was scheduled.
- `bypassed`: metadata policy did not allow intent prefetch.
- `navigation`: the user selected the entity link; includes available lead time.
- `consumed`: the destination list client boundary mounted; includes
  `routeReadyLeadTimeMs` and the Phase 4 browser-cache state.

It also records Performance Timeline measures named:

- `athyper:runtime-list:prefetch:<entity>:schedule`
- `athyper:runtime-list:prefetch:<entity>:intent-to-consumed`

Example development collector:

```js
window.addEventListener("athyper:runtime-list-prefetch", (event) => {
  console.table([event.detail]);
});
```

## Evaluation before broader prefetch

Compare dashboard-to-list visits with and without at least 60 ms of hover
lead time. Record the existing RSC route timing alongside:

- intent-to-navigation lead time;
- intent-to-consumed time;
- scheduled-to-consumed conversion rate;
- unused scheduled-prefetch rate;
- cold versus prefetched total RSC route time.

Do not enable viewport or eager behavior until the pilot demonstrates a useful
route-time reduction without an unacceptable unused-prefetch rate.
