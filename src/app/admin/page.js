"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// QR size bounds as a fraction of page width (mirrors src/lib/pdf.js).
const MIN_SIZE = 0.04;
const MAX_SIZE = 0.8;
const MARGIN = 0.03; // default edge margin (fraction of page width)
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// 3×3 preset anchors. Given a size + page dims, place the QR's top-left so it
// sits at that anchor with an even visual margin.
const V_ANCHORS = ["top", "middle", "bottom"];
const H_ANCHORS = ["left", "center", "right"];
function anchorXY(v, h, size, W, H) {
  const hF = (size * W) / H; // QR height as a fraction of page height
  const mx = MARGIN;
  const my = (MARGIN * W) / H; // equal visual margin, vertically
  const x = h === "left" ? mx : h === "center" ? (1 - size) / 2 : 1 - size - mx;
  const y = v === "top" ? my : v === "middle" ? (1 - hF) / 2 : 1 - hF - my;
  return { x, y };
}

// Nearest snap target within `thr`, else the raw value (no guide).
function snap(v, targets, thr) {
  let best = null;
  let bestD = thr;
  for (const t of targets) {
    const d = Math.abs(v - t.v);
    if (d <= bestD) {
      bestD = d;
      best = t;
    }
  }
  return best ? { value: best.v, guide: best.g } : { value: v, guide: null };
}

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

function StatusBadge({ status }) {
  const revoked = status === "revoked";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        revoked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${revoked ? "bg-red-500" : "bg-green-500"}`} />
      {revoked ? "Revoked" : "Active"}
    </span>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);

  // Restore a saved session token on load.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("ob_admin_token") : "";
    if (saved) {
      setToken(saved);
      verify(saved).then((ok) => {
        setAuthed(ok);
        if (!ok) sessionStorage.removeItem("ob_admin_token");
        setBooting(false);
      });
    } else {
      setBooting(false);
    }
  }, []);

  async function verify(t) {
    try {
      const res = await fetch("/api/certificate/list?limit=1", { headers: authHeaders(t) });
      return res.ok;
    } catch {
      return false;
    }
  }

  if (booting) {
    return <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div>;
  }

  if (!authed) {
    return (
      <LoginGate
        token={token}
        setToken={setToken}
        onSuccess={(t) => {
          sessionStorage.setItem("ob_admin_token", t);
          setAuthed(true);
        }}
        verify={verify}
      />
    );
  }

  return (
    <Dashboard
      token={token}
      onLogout={() => {
        sessionStorage.removeItem("ob_admin_token");
        setToken("");
        setAuthed(false);
      }}
    />
  );
}

function LoginGate({ token, setToken, onSuccess, verify }) {
  const [value, setValue] = useState(token || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await verify(value);
    setLoading(false);
    if (ok) {
      setToken(value);
      onSuccess(value);
    } else {
      setError("Incorrect password.");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-xl font-black uppercase tracking-tight">Certificate Admin</h1>
        <p className="mt-1 text-sm text-gray-500">Enter the admin password to continue.</p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Admin password"
          className="mt-6 w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-black"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !value}
          className="mt-4 w-full rounded-lg bg-black py-2.5 font-semibold text-white disabled:opacity-40"
        >
          {loading ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ token, onLogout }) {
  const [result, setResult] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/80 px-6 py-4 backdrop-blur">
        <h1 className="pl-[16svw] text-lg font-black uppercase tracking-tight">Certificate Admin</h1>
        <button onClick={onLogout} className="text-sm text-gray-500 hover:text-black">
          Log out
        </button>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 p-6">
        <IssueForm
          token={token}
          onIssued={(cert) => {
            setResult(cert);
            setRefreshKey((k) => k + 1);
          }}
        />
        {result && <IssueResult cert={result} onDismiss={() => setResult(null)} />}
        <CertificateList token={token} refreshKey={refreshKey} />
      </main>
    </div>
  );
}

function IssueForm({ token, onIssued }) {
  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  const paneRef = useRef(null);
  const dragRef = useRef(null); // { mode, sx, sy, start:{x,y,size} }
  const pendingInit = useRef(false); // reset placement only for a freshly-chosen PDF

  const [fileName, setFileName] = useState("");
  const [form, setForm] = useState({ name: "", certType: "", recipientEmail: "", allPages: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pdfData, setPdfData] = useState(null); // Uint8Array for rendering
  const [preview, setPreview] = useState(null); // { cssWidth, cssHeight } once rendered
  const [previewErr, setPreviewErr] = useState("");
  const [rendering, setRendering] = useState(false);
  const [resizeTick, setResizeTick] = useState(0);
  const [qr, setQr] = useState({ x: 0.72, y: 0.72, size: 0.18 }); // fractions, top-left origin
  const [qrImg, setQrImg] = useState(null); // object URL of the representative QR
  const [dragging, setDragging] = useState(false);
  const [guides, setGuides] = useState({ vx: null, hy: null }); // active snap lines (fractions)

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Fetch a representative QR image once for the editor overlay.
  useEffect(() => {
    let url;
    (async () => {
      try {
        const res = await fetch("/api/certificate/qr-preview", { headers: authHeaders(token) });
        if (!res.ok) return;
        url = URL.createObjectURL(await res.blob());
        setQrImg(url);
      } catch {}
    })();
    return () => url && URL.revokeObjectURL(url);
  }, [token]);

  // Re-fit the preview when the window (and therefore the pane) resizes.
  useEffect(() => {
    if (!pdfData) return;
    let t;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => setResizeTick((n) => n + 1), 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [pdfData]);

  // When a PDF is chosen (or the pane resizes), render page 1 into the canvas.
  useEffect(() => {
    if (!pdfData || !canvasRef.current || !paneRef.current) return;
    let cancelled = false;
    setRendering(true);
    setPreviewErr("");
    const maxWidth = Math.max(240, Math.floor(paneRef.current.clientWidth));
    const maxHeight = Math.max(340, Math.min(760, window.innerHeight - 220));
    (async () => {
      try {
        const { renderFirstPage } = await import("@/lib/pdfPreview");
        const info = await renderFirstPage(pdfData.slice(0), canvasRef.current, { maxWidth, maxHeight });
        if (cancelled) return;
        setPreview({ cssWidth: info.cssWidth, cssHeight: info.cssHeight });
        if (pendingInit.current) {
          pendingInit.current = false;
          setQr((q) => {
            const size = q.size || 0.18;
            const hFrac = (size * info.cssWidth) / info.cssHeight;
            return { size, x: 1 - size - MARGIN, y: 1 - hFrac - (MARGIN * info.cssWidth) / info.cssHeight };
          });
        }
      } catch {
        if (!cancelled)
          setPreviewErr("Couldn't render a preview of this PDF — it'll still issue (QR bottom-right).");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfData, resizeTick]);

  function onFile(e) {
    const file = e.target.files?.[0];
    setFileName(file?.name || "");
    setPreview(null);
    setPreviewErr("");
    pendingInit.current = true;
    if (!file) return setPdfData(null);
    file.arrayBuffer().then((buf) => setPdfData(new Uint8Array(buf)));
  }

  // Placement presets and size (need the rendered page dimensions).
  function setPreset(v, h) {
    if (!preview) return;
    setQr((q) => ({ ...q, ...anchorXY(v, h, q.size, preview.cssWidth, preview.cssHeight) }));
  }
  function setSize(v) {
    if (!preview) return;
    const { cssWidth: W, cssHeight: H } = preview;
    const size = clamp(v, MIN_SIZE, 0.6);
    const hF = (size * W) / H;
    setQr((q) => ({ size, x: clamp(q.x, 0, 1 - size), y: clamp(q.y, 0, 1 - hF) }));
  }

  const box = preview && {
    left: qr.x * preview.cssWidth,
    top: qr.y * preview.cssHeight,
    side: qr.size * preview.cssWidth,
  };

  function startDrag(mode, e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...qr } };
    setDragging(true);
  }
  function onMove(e) {
    const d = dragRef.current;
    if (!d || !preview) return;
    const { cssWidth: W, cssHeight: H } = preview;
    const dxF = (e.clientX - d.sx) / W;
    const dyF = (e.clientY - d.sy) / H;
    if (d.mode === "move") {
      const s = d.start.size;
      const hF = (s * W) / H;
      const mX = MARGIN;
      const mY = (MARGIN * W) / H;
      const nx = clamp(d.start.x + dxF, 0, 1 - s);
      const ny = clamp(d.start.y + dyF, 0, 1 - hF);
      // Snap the QR's left/top to page edges, margins, or center.
      const sx = snap(nx, [
        { v: 0, g: 0 }, { v: mX, g: mX }, { v: (1 - s) / 2, g: 0.5 },
        { v: 1 - mX - s, g: 1 - mX }, { v: 1 - s, g: 1 },
      ], 7 / W);
      const sy = snap(ny, [
        { v: 0, g: 0 }, { v: mY, g: mY }, { v: (1 - hF) / 2, g: 0.5 },
        { v: 1 - mY - hF, g: 1 - mY }, { v: 1 - hF, g: 1 },
      ], 7 / H);
      setQr({ size: s, x: sx.value, y: sy.value });
      setGuides({ vx: sx.guide, hy: sy.guide });
    } else {
      const maxByW = 1 - d.start.x;
      const maxByH = ((1 - d.start.y) * H) / W;
      const size = clamp(d.start.size + dxF, MIN_SIZE, Math.min(MAX_SIZE, maxByW, maxByH));
      setQr({ x: d.start.x, y: d.start.y, size });
    }
  }
  function endDrag() {
    dragRef.current = null; // pointer capture auto-releases on pointerup
    setDragging(false);
    setGuides({ vx: null, hy: null });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a PDF certificate to upload.");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", form.name);
    fd.append("certType", form.certType);
    fd.append("recipientEmail", form.recipientEmail);
    fd.append("allPages", String(form.allPages));
    if (preview) {
      fd.append("x", qr.x.toFixed(4));
      fd.append("y", qr.y.toFixed(4));
      fd.append("size", qr.size.toFixed(4));
    }

    setLoading(true);
    try {
      const res = await fetch("/api/certificate/issue", {
        method: "POST",
        headers: authHeaders(token),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to issue certificate.");
      onIssued(data.certificate);
      setForm({ name: "", certType: "", recipientEmail: "", allPages: false });
      setFileName("");
      setPdfData(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-black";

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <h2 className="text-base font-bold">Issue a certificate</h2>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* ── Controls ── */}
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Recipient name *</span>
            <input className={inputCls} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Jane Doe" required />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Certificate type *</span>
            <input className={inputCls} value={form.certType} onChange={(e) => update("certType", e.target.value)} placeholder="Certificate of Completion" required />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Recipient email</span>
            <input type="email" className={inputCls} value={form.recipientEmail} onChange={(e) => update("recipientEmail", e.target.value)} placeholder="jane@example.com" />
          </label>

          <div>
            <span className="text-sm font-medium">Certificate PDF *</span>
            <label className="mt-1 flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 hover:border-black">
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />
              {fileName ? <span className="font-medium text-black">{fileName}</span> : <span>Click to choose a PDF</span>}
            </label>
          </div>

          {/* Placement presets + size */}
          {preview && (
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">QR placement</span>
                <span className="text-xs text-gray-400">{Math.round(qr.size * 100)}% wide</span>
              </div>
              <div className="mt-2 flex items-start gap-3">
                <div className="grid shrink-0 grid-cols-3 gap-1">
                  {V_ANCHORS.map((v) =>
                    H_ANCHORS.map((h) => (
                      <button
                        key={v + h}
                        type="button"
                        onClick={() => setPreset(v, h)}
                        title={`${v} ${h}`}
                        className="relative h-7 w-7 rounded border border-gray-300 hover:border-black hover:bg-gray-50"
                      >
                        <span
                          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-500"
                          style={{
                            top: v === "top" ? "24%" : v === "middle" ? "50%" : "76%",
                            left: h === "left" ? "24%" : h === "center" ? "50%" : "76%",
                          }}
                        />
                      </button>
                    ))
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-xs text-gray-500">Size</span>
                  <input
                    type="range"
                    min={MIN_SIZE}
                    max={0.6}
                    step={0.005}
                    value={qr.size}
                    onChange={(e) => setSize(parseFloat(e.target.value))}
                    className="mt-1 w-full accent-black"
                  />
                  <div className="mt-1 flex gap-1">
                    {[["S", 0.1], ["M", 0.18], ["L", 0.28]].map(([lbl, v]) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => setSize(v)}
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:border-black"
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.allPages} onChange={(e) => update("allPages", e.target.checked)} className="h-4 w-4" />
            <span className="text-sm">Stamp the QR on all pages</span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="w-full rounded-lg bg-black py-3 font-semibold text-white disabled:opacity-40">
            {loading ? "Issuing…" : "Generate QR & issue"}
          </button>
        </div>

        {/* ── Big preview pane ── */}
        <div className="rounded-xl border border-gray-200 bg-gray-100 p-3">
          <div ref={paneRef}>
            {!pdfData ? (
              <div className="grid h-[440px] place-items-center px-6 text-center text-sm text-gray-400">
                Choose a PDF to see a live preview, then drag the QR anywhere or use the presets.
              </div>
            ) : (
              <div
                className="relative mx-auto"
                style={preview ? { width: preview.cssWidth, height: preview.cssHeight } : { minHeight: 300 }}
              >
                <canvas ref={canvasRef} className="block" />
                {rendering && (
                  <div className="absolute inset-0 grid place-items-center text-sm text-gray-400">Rendering…</div>
                )}
                {preview && (
                  <>
                    {/* faint center guides while dragging */}
                    {dragging && (
                      <>
                        <div className="pointer-events-none absolute inset-y-0 w-px bg-gray-400/40" style={{ left: preview.cssWidth / 2 }} />
                        <div className="pointer-events-none absolute inset-x-0 h-px bg-gray-400/40" style={{ top: preview.cssHeight / 2 }} />
                      </>
                    )}
                    {/* highlighted snap lines */}
                    {guides.vx != null && (
                      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-indigo-500" style={{ left: guides.vx * preview.cssWidth }} />
                    )}
                    {guides.hy != null && (
                      <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-indigo-500" style={{ top: guides.hy * preview.cssHeight }} />
                    )}
                    {box && (
                      <div
                        onPointerDown={(e) => startDrag("move", e)}
                        onPointerMove={onMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className="absolute cursor-move touch-none select-none outline-2 outline-dashed outline-black/60"
                        style={{ left: box.left, top: box.top, width: box.side, height: box.side }}
                      >
                        {qrImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={qrImg} alt="QR" draggable={false} className="pointer-events-none h-full w-full" />
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-white/70 text-[10px] font-semibold text-gray-500">QR</div>
                        )}
                        <span
                          onPointerDown={(e) => startDrag("resize", e)}
                          className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize touch-none rounded-full border-2 border-white bg-black shadow"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {previewErr && <p className="mt-1 text-xs text-amber-600">{previewErr}</p>}
          {preview && (
            <p className="mt-2 text-center text-xs text-gray-400">
              Drag to move · drag the corner to resize · snaps to guides
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

function IssueResult({ cert, onDismiss }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cert.validationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-green-800">Certificate issued</h3>
          <p className="text-sm text-green-700">
            ID <span className="font-mono font-semibold">{cert.certId}</span>
          </p>
        </div>
        <button onClick={onDismiss} className="text-green-700 hover:text-green-900">
          ✕
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        {cert.qrCodeUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cert.qrCodeUrl}
            alt="Verification QR"
            className="h-28 w-28 rounded-lg border border-green-200 bg-white p-1"
          />
        )}
        <div className="flex flex-1 flex-col gap-2">
          <a
            href={cert.documentUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-black px-3 py-2 text-center text-sm font-semibold text-white"
          >
            Open stamped PDF
          </a>
          <a
            href={cert.validationUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-green-300 bg-white px-3 py-2 text-center text-sm font-semibold text-green-800"
          >
            Open validation page
          </a>
          <button
            onClick={copy}
            className="rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-medium text-green-800"
          >
            {copied ? "Copied!" : "Copy validation link"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CertificateList({ token, refreshKey }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const res = await fetch(`/api/certificate/list?${params}`, { headers: authHeaders(token) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load.");
      setItems(data.items);
      setMeta({ total: data.total, page: data.page, pages: data.pages });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, q, status, page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function toggleRevoke(cert) {
    const action = cert.status === "revoked" ? "reinstate" : "revoke";
    let reason = "";
    if (action === "revoke") {
      reason = window.prompt("Reason for revoking (optional):") ?? "";
    }
    try {
      const res = await fetch("/api/certificate/revoke", {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ certId: cert.certId, action, reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed.");
      setItems((list) => list.map((c) => (c.certId === cert.certId ? data.certificate : c)));
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">
          Issued certificates <span className="text-gray-400">({meta.total})</span>
        </h2>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Search name / ID / email"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-black"
          />
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-gray-400">
            <tr>
              <th className="py-2 pr-3 font-medium">Recipient</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">ID</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Issued</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  No certificates yet.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((c) => (
                <tr key={c.certId} className="align-middle">
                  <td className="py-3 pr-3">
                    <div className="font-medium">{c.name}</div>
                    {c.recipientEmail && (
                      <div className="text-xs text-gray-400">{c.recipientEmail}</div>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-gray-600">{c.certType}</td>
                  <td className="py-3 pr-3">
                    <span className="font-mono text-xs">{c.certId}</span>
                  </td>
                  <td className="py-3 pr-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-3 pr-3 text-gray-500">
                    {new Date(c.issueDate || c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <a
                        href={c.validationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        View
                      </a>
                      <button
                        onClick={() => toggleRevoke(c)}
                        className={`rounded-md px-2 py-1 text-xs font-medium ${
                          c.status === "revoked"
                            ? "border border-green-300 text-green-700 hover:bg-green-50"
                            : "border border-red-300 text-red-700 hover:bg-red-50"
                        }`}
                      >
                        {c.status === "revoked" ? "Reinstate" : "Revoke"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-gray-200 px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-gray-500">
            Page {meta.page} of {meta.pages}
          </span>
          <button
            disabled={page >= meta.pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-gray-200 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
