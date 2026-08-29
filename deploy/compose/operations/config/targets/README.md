# Prometheus target authority

The controller renders one JSON target file per running instance below
`$ATHYPER_RUNTIME_ROOT/operations/prometheus-targets`; this repository
directory contains documentation only. Every
target must include `instance`, `environment`, `service`, and `source_revision`
labels. Do not hand-add cross-instance Docker network addresses.
