"use client";
import * as React from "react";
import { getPlaneBrand, type BrandPlane } from "@athyper/platform-brand";

/**
 * Rich pre-login product showcase for the story panel. Sample workspace
 * content only -- illustrative, not real account/tenant/transaction data.
 */

import { WORKSPACES_BY_PLANE, type Act, type ChainStep, type LedgerEntry } from "./workspace-showcase-data";
import { isLand, NODES, LINKS, type MapNode } from "./workspace-map-data";

const ROTATE_MS = 8000;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
  }, []);
  return reduced;
}

function LedgerTape({ entries }: { readonly entries: readonly LedgerEntry[] }) {
  function block(entry: LedgerEntry, dupKey: string) {
    return <div className="a-ws-group" key={dupKey}>
      <div className="a-ws-group-head"><b>{entry.ref}</b><span>{entry.source}</span><time>{entry.date}</time></div>
      {entry.lines.map((line, i) => <div className="a-ws-line" key={i}>
        <span className="a-ws-acct"><code>{line.account}</code><span>{line.label}</span></span>
        <span className="a-ws-amt a-ws-dr">{line.debit ?? "—"}</span>
        <span className="a-ws-amt a-ws-cr">{line.credit ?? "—"}</span>
      </div>)}
    </div>;
  }
  return <>
    <div className="a-ws-cols"><span>Account</span><i>Debit</i><i>Credit</i></div>
    <div className="a-ws-viewport">
      <div className="a-ws-tape">
        {entries.map((e) => block(e, `a-${e.ref}`))}
        {entries.map((e) => block(e, `b-${e.ref}`))}
      </div>
      <div className="a-ws-postline" />
    </div>
  </>;
}

function ChainBody({ steps }: { readonly steps: readonly ChainStep[] }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const reduced = useReducedMotion();
  React.useEffect(() => {
    setActiveIndex(0);
    if (reduced) { setActiveIndex(steps.length); return; }
    let k = 0;
    const id = setInterval(() => {
      k++;
      setActiveIndex(k);
      if (k > steps.length) clearInterval(id);
    }, 1250);
    return () => clearInterval(id);
  }, [steps, reduced]);
  return <div className="a-ws-chain-wrap">
    <div className="a-ws-chain-head"><i /><span>Step</span><span>Result</span></div>
    <div className="a-ws-chain">
      {steps.map((step, i) => <div className={`a-ws-link${i < activeIndex ? " done" : ""}${i === activeIndex ? " now" : ""}`} key={step.ref}>
        <div className="a-ws-track"><i className="a-ws-node" /></div>
        <div className="a-ws-link-main">
          <div className="a-ws-link-top"><b>{step.name}</b><code>{step.ref}</code>
            {step.who ? <span className={`a-ws-who a-ws-who-${step.side ?? "both"}`}>{step.who}</span> : null}</div>
          <div className="a-ws-link-meta">{step.meta}</div>
        </div>
        <div className="a-ws-link-side"><b>{step.val}</b><span>{step.state}</span></div>
      </div>)}
    </div>
  </div>;
}

/* ---------- world map: real coastline data, hub/spoke network, hover tooltip ---------- */
const LAT_TOP = 79, LAT_BOT = -57, LAT_SPAN = LAT_TOP - LAT_BOT;
function vec(lon: number, lat: number) {
  const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180, c = Math.cos(b);
  return [c * Math.cos(a), c * Math.sin(a), Math.sin(b)] as const;
}
function ll(v: readonly number[]) {
  return [Math.atan2(v[1], v[0]) * (180 / Math.PI), Math.asin(Math.max(-1, Math.min(1, v[2]))) * (180 / Math.PI)] as const;
}

function MapBody() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const cvs = canvasRef.current, tip = tipRef.current;
    if (!cvs || !tip) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = 1, mapW = 0, mapH = 0, offX = 0, offY = 0;
    let dots: HTMLCanvasElement | null = null;
    let paths: { pts: (readonly [number, number] | null)[]; phase: number; speed: number }[] = [];
    let pts: { n: MapNode; x: number; y: number }[] = [];
    let hover: { n: MapNode; x: number; y: number } | null = null;
    let raf = 0;

    function px(lon: number, lat: number): [number, number] {
      return [offX + ((lon + 180) / 360) * mapW, offY + ((LAT_TOP - lat) / LAT_SPAN) * mapH];
    }
    function arcPoints(a: MapNode, b: MapNode) {
      const va = vec(a.lon, a.lat), vb = vec(b.lon, b.lat);
      const d = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
      const om = Math.acos(d), so = Math.sin(om), steps = 56;
      const out: (readonly [number, number] | null)[] = [];
      let prevX: number | null = null;
      const p0 = px(a.lon, a.lat), p1 = px(b.lon, b.lat);
      const lift = Math.min(0.26 * Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), mapH * 0.3);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        let v: readonly number[];
        if (so < 1e-6) v = va;
        else {
          const s1 = Math.sin((1 - t) * om) / so, s2 = Math.sin(t * om) / so;
          v = [va[0] * s1 + vb[0] * s2, va[1] * s1 + vb[1] * s2, va[2] * s1 + vb[2] * s2];
        }
        const g = ll(v), p = px(g[0], g[1]);
        if (prevX !== null && Math.abs(p[0] - prevX) > mapW * 0.5) out.push(null);
        prevX = p[0];
        out.push([p[0], p[1] - Math.sin(Math.PI * t) * lift]);
      }
      return out;
    }
    function buildDots() {
      const step = Math.max(4.2, Math.min(8, mapW / 170));
      const cols = Math.round(mapW / step), rows = Math.round(mapH / step);
      const r = Math.max(0.8, step * 0.17);
      const oc = document.createElement("canvas");
      oc.width = Math.round(W * dpr);
      oc.height = Math.round(H * dpr);
      const g = oc.getContext("2d")!;
      g.scale(dpr, dpr);
      for (let y = 0; y <= rows; y++) {
        const lat = LAT_TOP - (y / rows) * LAT_SPAN;
        for (let x = 0; x <= cols; x++) {
          const lon = -180 + (x / cols) * 360;
          if (!isLand(lon, lat)) continue;
          const p = px(lon, lat);
          if (p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
          const a = 0.2 + (1 - Math.min(1, Math.abs(lat) / 95)) * 0.2;
          g.beginPath();
          g.arc(p[0], p[1], r, 0, 6.2832);
          g.fillStyle = `rgba(150,182,226,${a.toFixed(3)})`;
          g.fill();
        }
      }
      dots = oc;
    }
    function layout() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cvs!.clientWidth;
      H = cvs!.clientHeight;
      if (!W || !H) return;
      cvs!.width = Math.round(W * dpr);
      cvs!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      mapW = W * 1.1;
      mapH = (mapW * LAT_SPAN) / 360;
      if (mapH > H * 0.86) { mapH = H * 0.86; mapW = (mapH * 360) / LAT_SPAN; }
      offX = (W - mapW) / 2;
      offY = (H - mapH) / 2 - 6;
      buildDots();
      const byId: Record<string, MapNode> = {};
      NODES.forEach((n) => { byId[n.id] = n; });
      pts = NODES.map((n) => { const p = px(n.lon, n.lat); return { n, x: p[0], y: p[1] }; });
      paths = LINKS.map(([a, b], i) => ({ pts: arcPoints(byId[a], byId[b]), phase: (i * 0.37) % 1, speed: 0.055 + ((i * 7) % 5) * 0.011 }));
    }
    function strokePath(pl: (readonly [number, number] | null)[], from: number, to: number, style: string, width: number) {
      ctx!.beginPath();
      let started = false;
      for (let i = from; i <= to && i < pl.length; i++) {
        const p = pl[i];
        if (!p) { started = false; continue; }
        if (!started) { ctx!.moveTo(p[0], p[1]); started = true; } else ctx!.lineTo(p[0], p[1]);
      }
      ctx!.strokeStyle = style;
      ctx!.lineWidth = width;
      ctx!.lineCap = "round";
      ctx!.stroke();
    }
    function frame(ts: number) {
      if (cvs && document.body.contains(cvs) && W && H) {
        ctx!.clearRect(0, 0, W, H);
        if (dots) ctx!.drawImage(dots, 0, 0, W, H);
        const t = (ts || 0) / 1000;
        for (const pa of paths) {
          const pl = pa.pts, n = pl.length;
          strokePath(pl, 0, n - 1, "rgba(158,192,236,0.17)", 0.9);
          if (!reduced) {
            const prog = (t * pa.speed + pa.phase) % 1;
            const head = Math.floor(prog * (n - 1));
            strokePath(pl, Math.max(0, head - Math.round(n * 0.17)), head, "rgba(206,229,255,0.72)", 1.2);
            const hp = pl[head];
            if (hp) {
              const gr = ctx!.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], 6);
              gr.addColorStop(0, "rgba(226,240,255,0.65)");
              gr.addColorStop(1, "rgba(226,240,255,0)");
              ctx!.fillStyle = gr;
              ctx!.beginPath();
              ctx!.arc(hp[0], hp[1], 6, 0, 6.2832);
              ctx!.fill();
            }
          }
        }
        for (const d of pts) {
          const nd = d.n, on = hover === d;
          const rr = nd.main ? 4.8 : nd.hub ? 3.9 : 3.2;
          if (nd.hub || on) {
            const g2 = ctx!.createRadialGradient(d.x, d.y, 0, d.x, d.y, rr * (on ? 4.5 : 3.5));
            g2.addColorStop(0, `rgba(180,214,255,${on ? 0.4 : 0.22})`);
            g2.addColorStop(1, "rgba(180,214,255,0)");
            ctx!.fillStyle = g2;
            ctx!.beginPath();
            ctx!.arc(d.x, d.y, rr * (on ? 4.5 : 3.5), 0, 6.2832);
            ctx!.fill();
          }
          ctx!.beginPath();
          ctx!.arc(d.x, d.y, rr, 0, 6.2832);
          if (nd.hub) { ctx!.fillStyle = "rgba(232,242,255,0.96)"; ctx!.fill(); }
          else { ctx!.strokeStyle = "rgba(206,228,255,0.82)"; ctx!.lineWidth = 1.3; ctx!.stroke(); }
        }
      }
      raf = requestAnimationFrame(frame);
    }
    function onMove(e: MouseEvent) {
      const r = cvs!.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      let found: { n: MapNode; x: number; y: number } | null = null;
      for (const p of pts) if (Math.hypot(p.x - mx, p.y - my) < 15) { found = p; break; }
      hover = found;
      if (found) {
        tip!.classList.add("on");
        tip!.style.left = `${found.x}px`;
        tip!.style.top = `${found.y}px`;
        const b = tip!.querySelector("b"), em = tip!.querySelector("em");
        if (b) b.textContent = found.n.name;
        if (em) em.textContent = found.n.note;
        cvs!.style.cursor = "pointer";
      } else {
        tip!.classList.remove("on");
        cvs!.style.cursor = "default";
      }
    }
    function onLeave() { hover = null; tip!.classList.remove("on"); }

    layout();
    raf = requestAnimationFrame(frame);
    cvs.addEventListener("mousemove", onMove);
    cvs.addEventListener("mouseleave", onLeave);
    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(layout, 140); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rt);
      cvs.removeEventListener("mousemove", onMove);
      cvs.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <>
    <canvas ref={canvasRef} className="a-ws-map-canvas" aria-label="World map of linked partner accounts and published profile links" />
    <div className="a-ws-legend">
      <span><i className="a-ws-legend-hub" />Network hub</span>
      <span><i className="a-ws-legend-lnk" />Linked partner</span>
      <span><i className="a-ws-legend-arc" />Published profile link</span>
    </div>
    <div className="a-ws-tip" ref={tipRef}><b /><em /></div>
  </>;
}

/* ---------- Atlas assistant demo (decorative -- no real backend call) ---------- */
function AtlasBar({ acts, workspaceKey }: { readonly acts: readonly Act[]; readonly workspaceKey: string }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<Act | null>(null);
  const [typed, setTyped] = React.useState("");
  const [settled, setSettled] = React.useState(false);
  const [confidenceWidth, setConfidenceWidth] = React.useState(0);
  const [done, setDone] = React.useState<string | null>(null);
  const typerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    setOpen(false);
    setActive(null);
    return () => { if (typerRef.current) clearInterval(typerRef.current); };
  }, [workspaceKey]);

  function run(act: Act) {
    if (typerRef.current) clearInterval(typerRef.current);
    setOpen(true);
    setActive(act);
    setDone(null);
    setSettled(false);
    setConfidenceWidth(0);
    setTyped("");
    if (reduced) { setTyped(act.say); setSettled(true); requestAnimationFrame(() => setConfidenceWidth(act.confidence)); return; }
    const words = act.say.split(" ");
    let i = 0;
    typerRef.current = setInterval(() => {
      i++;
      setTyped(words.slice(0, i).join(" "));
      if (i >= words.length) {
        if (typerRef.current) clearInterval(typerRef.current);
        setSettled(true);
        requestAnimationFrame(() => setConfidenceWidth(act.confidence));
      }
    }, 34);
  }

  return <div className="a-ws-atlas">
    {open && active ? <div className="a-ws-reply">
      <div className="a-ws-reply-head">
        <svg className="a-ws-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /></svg>
        <b>Atlas</b>
        <span className="a-ws-mode">{active.readonly ? "Answers only" : "Acts with your approval"}</span>
        <button className="a-ws-dismiss" type="button" onClick={() => setOpen(false)}>Dismiss</button>
      </div>
      <p className="a-ws-question">{active.q}</p>
      <p className="a-ws-say">{typed}{!settled ? <i className="a-ws-cur" /> : null}</p>
      {settled ? <>
        <div className="a-ws-touch">{active.touch.map((t) => <span key={t}>{t}</span>)}</div>
        <div className="a-ws-gov">
          {active.readonly
            ? <div><span>Effect</span><b>Reads only, nothing is written</b></div>
            : <><div><span>Policy</span><b>{active.policy}</b></div><div><span>Approval</span><b>{active.approver}</b></div></>}
          <div><span>Confidence</span><b>{(active.confidence / 100).toFixed(2)}</b><i className="a-ws-meter"><u style={{ width: `${confidenceWidth}%` }} /></i></div>
        </div>
        <div className="a-ws-run">
          {done ? <div className="a-ws-ok"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{done}</div>
            : active.readonly
              ? <button className="a-ws-alt" type="button" onClick={() => setOpen(false)}>Open the records</button>
              : <>
                <button className="a-ws-go" type="button" onClick={() => setDone(active.done ?? "Done.")}>Approve and run</button>
                <button className="a-ws-alt" type="button" onClick={() => setOpen(false)}>Not now</button>
              </>}
        </div>
      </> : null}
    </div> : null}
    <div className="a-ws-bar">
      <AtlasAiSloganMark />
      <span className="a-ws-demo-label">Demo · sample data</span>
    </div>
    <p className="a-ws-demo-guide">Select a question below to explore Atlas AI.</p>
    <div className="a-ws-sugg" role="group" aria-label="Sample questions">{acts.map((a) => <button key={a.q} type="button" aria-pressed={open && active === a} onClick={() => run(a)}>{a.q}</button>)}</div>
  </div>;
}

/* ---------- slogan lockups: vector text ported from brand-supplied SVGs.
   Fill overridden for the dark marketing panel (source files are tuned for
   light backgrounds); font falls back to the app sans-serif since the
   brand's display face isn't bundled in this repo. */
const SLOGAN_FONT = "'Conthrax-SemiBold','Conthrax',var(--a-font-sans)";

function SloganMark({ text }: { readonly text: string }) {
  return <svg viewBox="0 440 1300 70" className="a-ws-slogan-mark" role="img" aria-label={text}>
    <text x="4" y="495.28" fontFamily={SLOGAN_FONT} fontWeight={600} fontSize="50" fill="currentColor">{text}</text>
  </svg>;
}

function AtlasAiSloganMark() {
  return <svg viewBox="375 415 260 75" className="a-ws-atlas-slogan-mark" role="img" aria-label="atlasAI">
    <text x="390.45" y="471.23" fontFamily={SLOGAN_FONT} fontWeight={600} fontSize="50" fill="currentColor">atlasAI</text>
  </svg>;
}

/* Text sourced from plane-presentation.json -- the same descriptors already
   used for brand.description elsewhere on this page. */
export function WorkspaceShowcase({ plane }: { readonly plane: BrandPlane }) {
  const brand = getPlaneBrand(plane);
  const workspaces = WORKSPACES_BY_PLANE[plane];
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduced = useReducedMotion();
  const active = workspaces[index];
  const railRefs = React.useRef<(HTMLSpanElement | null)[]>([]);

  const go = React.useCallback((i: number) => setIndex(((i % workspaces.length) + workspaces.length) % workspaces.length), [workspaces.length]);

  React.useEffect(() => {
    if (reduced) return;
    let raf = 0, t0 = 0, elapsed = 0;
    function tick(ts: number) {
      if (paused) { t0 = ts - elapsed; raf = requestAnimationFrame(tick); return; }
      if (!t0) t0 = ts;
      elapsed = ts - t0;
      const fill = railRefs.current[index];
      if (fill) fill.style.width = `${Math.min(100, (elapsed / ROTATE_MS) * 100)}%`;
      if (elapsed >= ROTATE_MS) { go(index + 1); return; }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, paused, reduced, go]);

  React.useEffect(() => {
    railRefs.current.forEach((el, i) => { if (el && i !== index) el.style.width = "0%"; });
  }, [index]);

  return <div className={`a-ws a-ws-${plane}`}>
    <div className="a-ws-center">
    <div className="a-ws-top">
      <section className="a-ws-panel" aria-live="polite">
        <div className="a-ws-panel-title"><SloganMark text={brand.description} /></div>
        <div className="a-ws-panel-head">
          {active.head.map(([label, value, live]) => <div key={label}><span>{label}</span><b className={live ? "a-ws-live" : undefined}>{value}</b></div>)}
          <span className="a-ws-tab-pill" key={active.tab}>{active.tab}</span>
        </div>
        <div className="a-ws-body">
          {active.kind === "ledger" && active.ledger ? <LedgerTape entries={active.ledger} /> : null}
          {active.kind === "chain" && active.chain ? <ChainBody steps={active.chain} key={active.tab} /> : null}
          {active.kind === "map" ? <MapBody key={active.tab} /> : null}
        </div>
        <div className="a-ws-panel-foot">
          <span className="a-ws-foot-k">{active.foot[0]}</span>
          <span className="a-ws-foot-vals"><span className="a-ws-foot-v">{active.foot[1]}</span><span className="a-ws-foot-balanced">{active.foot[2]}</span></span>
        </div>
      </section>
    </div>

    <div className="a-ws-rail" role="tablist" aria-label={`${brand.shortName} workspaces`}>
      {workspaces.map((w, i) => <button key={w.tab} type="button" role="tab" className="a-ws-indicator" aria-current={i === index} aria-label={w.tab}
        onClick={() => go(i)}>
        <span className="a-ws-indicator-fill" ref={(el) => { railRefs.current[i] = el; }} />
      </button>)}
    </div>

    <div className="a-ws-atlas-wrap" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <AtlasBar acts={active.acts} workspaceKey={active.tab} />
    </div>
    </div>
  </div>;
}
