# Prometheus target authority

The controller will render one JSON target file per admitted instance. Every
target must include `instance`, `environment`, `service`, and `source_revision`
labels. Do not hand-add cross-instance Docker network addresses.
