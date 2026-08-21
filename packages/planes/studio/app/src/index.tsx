export const studioApplication = Object.freeze({ plane: "studio", name: "Athyper Studio", purpose: "Platform control and authoring" });

export function StudioApplicationSkeleton() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "#18110a", color: "#fffbeb", fontFamily: "system-ui, sans-serif" }}>
    <section aria-labelledby="application-title" style={{ width: "min(42rem, 100%)", border: "1px solid #92400e", borderRadius: "1rem", padding: "clamp(2rem, 8vw, 4rem)", background: "#2b1d0e" }}>
      <p style={{ margin: 0, color: "#fbbf24", fontSize: ".75rem", fontWeight: 700, letterSpacing: ".14em" }}>STUDIO PLANE</p>
      <h1 id="application-title" style={{ margin: ".75rem 0", fontSize: "clamp(2rem, 7vw, 4rem)", lineHeight: 1 }}>{studioApplication.name}</h1>
      <p style={{ margin: 0, color: "#fef3c7", lineHeight: 1.6 }}>The active frontend spine is ready for secure application capabilities.</p>
    </section>
  </main>;
}
