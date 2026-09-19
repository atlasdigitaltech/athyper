export default function preflight() {
  const missing = ["PLAYWRIGHT_NEON_USER", "PLAYWRIGHT_NEON_PASSWORD"].filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Authenticated Neon review cannot run. Configure ${missing.join(", ")} in the shell or secret manager; do not paste credentials into chat. No tests were authenticated.`);
}
