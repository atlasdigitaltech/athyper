export const meshApplication = Object.freeze({ plane: "mesh", name: "Athyper Mesh", purpose: "Trusted network exchange" });

export function MeshApplicationSkeleton() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "#071a17", color: "#f0fdfa", fontFamily: "system-ui, sans-serif" }}>
    <section aria-labelledby="application-title" style={{ width: "min(42rem, 100%)", border: "1px solid #115e59", borderRadius: "1rem", padding: "clamp(2rem, 8vw, 4rem)", background: "#0f2924" }}>
      <p style={{ margin: 0, color: "#5eead4", fontSize: ".75rem", fontWeight: 700, letterSpacing: ".14em" }}>MESH PLANE</p>
      <h1 id="application-title" style={{ margin: ".75rem 0", fontSize: "clamp(2rem, 7vw, 4rem)", lineHeight: 1 }}>{meshApplication.name}</h1>
      <p style={{ margin: 0, color: "#ccfbf1", lineHeight: 1.6 }}>The active frontend spine is ready for secure application capabilities.</p>
    </section>
  </main>;
}
