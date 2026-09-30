const plain = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
function keys(value, allowed, at) {
  if (!plain(value) || Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error(`Invalid configuration object: ${at}`);
  for (const key of allowed)
    if (!(key in value)) throw new Error(`Missing configuration: ${at}.${key}`);
}
function names(value, at, choices) {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        !/^[a-z][a-z0-9-]*$/.test(item) ||
        (choices && !choices.includes(item)),
    ) ||
    new Set(value).size !== value.length
  )
    throw new Error(`Invalid configuration names: ${at}`);
}
export function validateCatalog(catalog) {
  keys(
    catalog,
    ["schemaVersion", "coreServices", "capabilities", "presets"],
    "catalog",
  );
  if (catalog.schemaVersion !== 1) throw new Error("Unsupported preset schema");
  names(catalog.coreServices, "coreServices");
  if (!catalog.coreServices.length || !plain(catalog.capabilities))
    throw new Error("Missing core services/capabilities");
  names(Object.keys(catalog.capabilities), "capabilities");
  for (const [name, capability] of Object.entries(catalog.capabilities)) {
    keys(capability, ["services", "profiles"], name);
    names(capability.services, `${name}.services`);
    names(capability.profiles, `${name}.profiles`);
    if (!capability.services.length)
      throw new Error(`Empty capability: ${name}`);
  }
  keys(catalog.presets, ["devsimple", "devfull"], "presets");
  for (const [name, preset] of Object.entries(catalog.presets)) {
    keys(
      preset,
      [
        "apps",
        "capabilities",
        "idleInfrastructureLimitMiB",
        "buildConcurrency",
        "minimumAvailableMiB",
        "serviceMemoryMiB",
      ],
      name,
    );
    if (
      !Number.isInteger(preset.minimumAvailableMiB) ||
      preset.minimumAvailableMiB < 1024 ||
      !plain(preset.serviceMemoryMiB)
    )
      throw new Error(`Invalid admission budget: ${name}`);
    for (const [service, memory] of Object.entries(preset.serviceMemoryMiB)) {
      if (
        ![
          ...catalog.coreServices,
          ...Object.values(catalog.capabilities).flatMap((cap) => cap.services),
        ].includes(service) ||
        !Number.isInteger(memory) ||
        memory < 64
      )
        throw new Error(`Invalid service memory: ${service}`);
    }
    names(preset.apps, `${name}.apps`, ["studio", "neon", "mesh"]);
    names(
      preset.capabilities,
      `${name}.capabilities`,
      Object.keys(catalog.capabilities),
    );
    if (
      !preset.apps.length ||
      !Number.isInteger(preset.idleInfrastructureLimitMiB) ||
      preset.idleInfrastructureLimitMiB < 1024 ||
      !Number.isInteger(preset.buildConcurrency) ||
      preset.buildConcurrency < 1 ||
      preset.buildConcurrency > 32
    )
      throw new Error(`Invalid resource budget: ${name}`);
  }
  return catalog;
}
export function overridePorts(ports, overrides = {}) {
  if (!plain(overrides)) throw new Error("Port overrides must be an object");
  for (const [name, port] of Object.entries(overrides)) {
    if (
      !(name in ports) ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535
    )
      throw new Error(`Invalid port override: ${name}`);
  }
  const result = { ...ports, ...overrides };
  if (new Set(Object.values(result)).size !== Object.keys(result).length)
    throw new Error("Local ports must be distinct");
  return result;
}
