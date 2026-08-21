export const neonApplication = Object.freeze({ plane: "neon", name: "Athyper Neon", purpose: "Enterprise operations" });

export function NeonApplicationSkeleton() {
  return <ApplicationSkeleton eyebrow="NEON PLANE" title={neonApplication.name} description="The active frontend spine is ready for secure application capabilities." />;
}

function ApplicationSkeleton({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "#07111f", color: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
    <section aria-labelledby="application-title" style={{ width: "min(42rem, 100%)", border: "1px solid #334155", borderRadius: "1rem", padding: "clamp(2rem, 8vw, 4rem)", background: "#0f172a" }}>
      <p style={{ margin: 0, color: "#38bdf8", fontSize: ".75rem", fontWeight: 700, letterSpacing: ".14em" }}>{eyebrow}</p>
      <h1 id="application-title" style={{ margin: ".75rem 0", fontSize: "clamp(2rem, 7vw, 4rem)", lineHeight: 1 }}>{title}</h1>
      <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.6 }}>{description}</p>
    </section>
  </main>;
}
