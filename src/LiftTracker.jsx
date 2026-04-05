import { useState, useRef } from "react";

// ─── Data ────────────────────────────────────────────────────────────────────
const DEFAULT_EXERCISES = [
  { id: "squat",            name: "Squat",             group: "Legs",      emoji: "🏋️" },
  { id: "deadlift",         name: "Deadlift",          group: "Back",      emoji: "⛓️" },
  { id: "bench_press",      name: "Bench Press",       group: "Chest",     emoji: "🫁" },
  { id: "pull_up",          name: "Pull Up",           group: "Back",      emoji: "🔝" },
  { id: "bicep_curl",       name: "Bicep Curl",        group: "Arms",      emoji: "💪" },
  { id: "tricep_extension", name: "Tricep Extension",  group: "Arms",      emoji: "🔱" },
  { id: "shoulder_raise",   name: "Shoulder Raise",    group: "Shoulders", emoji: "🏔️" },
  { id: "leg_extension",    name: "Leg Extension",     group: "Legs",      emoji: "🦵" },
  { id: "leg_curl",         name: "Leg Curl",          group: "Legs",      emoji: "🔄" },
];

const STORAGE_KEY = "liftlog_v2";
const EX_STORAGE_KEY = "liftlog_exercises_v1";
const loadData = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
};
const saveData = (d) => localStorage.setItem(STORAGE_KEY, JSON.stringify(d));

const loadExercises = () => {
  try { return JSON.parse(localStorage.getItem(EX_STORAGE_KEY)) || DEFAULT_EXERCISES; }
  catch { return DEFAULT_EXERCISES; }
};
const saveExercises = (e) => localStorage.setItem(EX_STORAGE_KEY, JSON.stringify(e));

const fmtShort = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ─── CSV helpers ─────────────────────────────────────────────────────────────
const CSV_HEADER = "id,date,exerciseId,weight,sets,reps,notes";

function toCSV(sessions) {
  const rows = sessions.map((s) =>
    [s.id, s.date, s.exerciseId, s.weight, s.sets, s.reps,
      `"${(s.notes || "").replace(/"/g, '""')}"`].join(",")
  );
  return [CSV_HEADER, ...rows].join("\n");
}

function fromCSV(text) {
  const lines = text.trim().split("\n");
  if (lines[0].trim() !== CSV_HEADER) throw new Error("Invalid file — wrong headers.");
  return lines.slice(1).map((line, i) => {
    const parts = [];
    let cur = "", inQ = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { parts.push(cur); cur = ""; continue; }
      cur += c;
    }
    parts.push(cur);
    const [id, date, exerciseId, weight, sets, reps, notes] = parts;
    if (!date || !exerciseId) throw new Error(`Row ${i + 2} is malformed.`);
    return {
      id: Number(id) || Date.now() + i,
      date,
      exerciseId,
      weight: parseFloat(weight) || 0,
      sets: parseInt(sets) || 1,
      reps: parseInt(reps) || 1,
      notes: notes || "",
    };
  });
}

// ─── Sparkline chart ─────────────────────────────────────────────────────────
function Sparkline({ data, color }) {
  if (data.length < 2)
    return <span style={{ fontSize: 11, color: "#64748b" }}>Log 2+ sets to see chart</span>;
  const W = 260, H = 52;
  const vals = data.map((d) => d.weight);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - 4 - ((d.weight - min) / range) * (H - 10),
  }));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`g_${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path + ` L${W},${H} L0,${H} Z`} fill={`url(#g_${color.replace("#","")})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={color} stroke="#1e293b" strokeWidth="2">
          <title>{`${fmtShort(data[i].date)}: ${data[i].weight} lbs`}</title>
        </circle>
      ))}
    </svg>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function LiftTracker() {
  const [sessions, setSessions] = useState(loadData);
  const [exercises, setExercises] = useState(loadExercises);
  const [tab, setTab] = useState("log");
  const [selEx, setSelEx] = useState(() => loadExercises()[0]?.id || "squat");
  const [weight, setWeight] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [notes, setNotes] = useState("");
  const [flash, setFlash] = useState(null);
  const [importPending, setImportPending] = useState(null);
  const fileRef = useRef();

  // Exercise management modal state
  const [showExModal, setShowExModal] = useState(false);
  const [newExName, setNewExName] = useState("");
  const [newExEmoji, setNewExEmoji] = useState("💪");
  const [newExGroup, setNewExGroup] = useState("Other");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const persist = (s) => { setSessions(s); saveData(s); };
  const persistEx = (ex) => { setExercises(ex); saveExercises(ex); };

  const handleAddExercise = () => {
    const name = newExName.trim();
    if (!name) return showFlash("error", "Please enter an exercise name.");
    if (exercises.find((e) => e.name.toLowerCase() === name.toLowerCase()))
      return showFlash("error", "An exercise with that name already exists.");
    const id = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + Date.now();
    persistEx([...exercises, { id, name, group: newExGroup, emoji: newExEmoji }]);
    setNewExName(""); setNewExEmoji("💪"); setNewExGroup("Other");
    showFlash("success", `${name} added!`);
  };

  const handleDeleteExercise = (id) => {
    const updated = exercises.filter((e) => e.id !== id);
    persistEx(updated);
    if (selEx === id) setSelEx(updated[0]?.id || "");
    setDeleteConfirmId(null);
    showFlash("success", "Exercise removed.");
  };
  const showFlash = (type, msg) => {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 3000);
  };

  const handleLog = () => {
    if (!weight || isNaN(parseFloat(weight)))
      return showFlash("error", "Please enter a valid weight.");
    const entry = {
      id: Date.now(),
      date: new Date().toISOString(),
      exerciseId: selEx,
      weight: parseFloat(weight),
      sets: parseInt(sets) || 1,
      reps: parseInt(reps) || 1,
      notes,
    };
    persist([entry, ...sessions]);
    setWeight(""); setNotes("");
    showFlash("success", `${exercises.find((e) => e.id === selEx)?.name} logged! 🎯`);
  };

  const deleteEntry = (id) => persist(sessions.filter((s) => s.id !== id));

  const handleExport = () => {
    const blob = new Blob([toCSV(sessions)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liftlog_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showFlash("success", "CSV exported successfully!");
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        setImportPending(fromCSV(ev.target.result));
      } catch (err) {
        showFlash("error", err.message || "Could not read file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmImport = () => {
    if (!importPending) return;
    persist(importPending);
    setImportPending(null);
    showFlash("success", `Imported ${importPending.length} entries!`);
  };

  // Per-exercise stats
  const exStats = exercises.map((ex) => {
    const logs = sessions
      .filter((s) => s.exerciseId === ex.id)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const pr = logs.length ? Math.max(...logs.map((l) => l.weight)) : null;
    const latest = logs[logs.length - 1];
    const prev = logs[logs.length - 2];
    const trend = latest && prev ? latest.weight - prev.weight : null;
    return { ...ex, logs, pr, latest, trend };
  });

  const currentEx = exercises.find((e) => e.id === selEx);
  const currentPR = sessions
    .filter((s) => s.exerciseId === selEx)
    .reduce((m, s) => Math.max(m, s.weight), 0) || null;
  const recentForEx = sessions.filter((s) => s.exerciseId === selEx).slice(0, 5);

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "'Sora', 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=Teko:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0f172a; --surface: #1e293b; --surface2: #263348;
          --border: #334155; --accent: #6ee7b7; --accent2: #38bdf8;
          --danger: #f87171; --warn: #fbbf24;
          --text: #e2e8f0; --muted: #94a3b8; --faint: #475569;
        }
        input, select, textarea {
          background: var(--surface); border: 1.5px solid var(--border); border-radius: 10px;
          color: var(--text); font-family: 'Sora', sans-serif; font-size: 15px;
          padding: 11px 14px; outline: none; width: 100%;
          transition: border-color .18s, box-shadow .18s;
          -webkit-appearance: none;
        }
        input:focus, select:focus, textarea:focus {
          border-color: var(--accent); box-shadow: 0 0 0 3px rgba(110,231,183,.12);
        }
        select option { background: #1e293b; }
        button { cursor: pointer; border: none; font-family: 'Sora', sans-serif; transition: all .15s; }
        .tab-btn {
          flex: 1; padding: 13px 4px; background: none;
          color: var(--faint); font-size: 11px; font-weight: 600;
          letter-spacing: .5px; text-transform: uppercase;
          border-bottom: 2px solid transparent;
        }
        .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
        .tab-btn:hover:not(.active) { color: var(--muted); }
        .btn-primary {
          background: var(--accent); color: #0f172a; border-radius: 10px;
          padding: 13px 20px; font-size: 15px; font-weight: 700; letter-spacing: .2px;
        }
        .btn-primary:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(110,231,183,.25); }
        .btn-primary:active { transform: translateY(0); filter: brightness(.96); }
        .btn-primary:disabled { background: var(--border); color: var(--faint); cursor: not-allowed; transform: none; box-shadow: none; }
        .btn-secondary {
          background: var(--surface2); color: var(--text); border-radius: 10px;
          border: 1.5px solid var(--border); padding: 12px 18px; font-size: 14px; font-weight: 500;
        }
        .btn-secondary:hover { border-color: var(--accent2); color: var(--accent2); }
        .btn-icon {
          background: none; color: var(--faint); border-radius: 8px;
          padding: 5px 9px; font-size: 14px; line-height: 1;
        }
        .btn-icon:hover { background: rgba(248,113,113,.12); color: var(--danger); }
        .card {
          background: var(--surface); border: 1.5px solid var(--border);
          border-radius: 16px; padding: 18px;
        }
        .ex-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 999px;
          border: 1.5px solid var(--border); background: none;
          color: var(--muted); font-size: 13px; font-weight: 500;
          white-space: nowrap;
        }
        .ex-chip.active { background: var(--accent); border-color: var(--accent); color: #0f172a; font-weight: 700; }
        .ex-chip:hover:not(.active) { border-color: var(--accent2); color: var(--accent2); }
        .label { font-size: 11px; font-weight: 600; color: var(--faint); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 7px; }
        .log-row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px; border-radius: 10px;
          border: 1.5px solid var(--border); background: var(--surface);
          margin-bottom: 7px; transition: border-color .15s;
        }
        .log-row:hover { border-color: var(--surface2); background: var(--surface2); }
        .flash {
          position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
          padding: 12px 24px; border-radius: 999px;
          font-size: 13px; font-weight: 600; z-index: 300;
          animation: fadeSlide 3s ease forwards;
          white-space: nowrap; box-shadow: 0 8px 30px rgba(0,0,0,.45);
          pointer-events: none;
        }
        .flash.success { background: var(--accent); color: #0f172a; }
        .flash.error { background: var(--danger); color: #fff; }
        @keyframes fadeSlide {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          12%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,.75);
          display: flex; align-items: center; justify-content: center;
          z-index: 200; padding: 20px;
        }
        .modal {
          background: var(--surface); border: 1.5px solid var(--border);
          border-radius: 18px; padding: 28px 24px;
          max-width: 380px; width: 100%;
          box-shadow: 0 24px 60px rgba(0,0,0,.6);
          animation: popIn .2s ease;
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        .trend-up   { color: #4ade80; }
        .trend-down { color: var(--danger); }
        .trend-flat { color: var(--faint); }
        .ex-manage-row {
          display: flex; align-items: center; gap: 10;
          padding: 10px 12px; border-radius: 10px;
          border: 1.5px solid var(--border);
          margin-bottom: 6px; background: var(--surface);
        }
        .ex-manage-row:hover { background: var(--surface2); }
        .btn-add-ex {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 999px;
          border: 1.5px dashed var(--border); background: none;
          color: var(--accent2); font-size: 13px; font-weight: 500;
          white-space: nowrap;
        }
        .btn-add-ex:hover { border-color: var(--accent2); background: rgba(56,189,248,.07); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        input[type=number]::-webkit-inner-spin-button { opacity: .4; }
      `}</style>

      {/* Flash toast */}
      {flash && <div className={`flash ${flash.type}`}>{flash.msg}</div>}

      {/* Import confirm modal */}
      {importPending && (
        <div className="modal-backdrop">
          <div className="modal">
            <div style={{ fontSize: 28, marginBottom: 10 }}>📥</div>
            <div style={{ fontFamily: "'Teko', sans-serif", fontSize: 24, letterSpacing: 1, marginBottom: 8 }}>
              Import Workout Data?
            </div>
            <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.65, marginBottom: 20 }}>
              This will <strong style={{ color: "var(--danger)" }}>replace all your current data</strong> with{" "}
              <strong style={{ color: "var(--accent)" }}>{importPending.length} entries</strong> from the file.
              Make sure to export first if you want to keep what you have.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={confirmImport}>
                Yes, Import
              </button>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setImportPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Exercises Modal */}
      {showExModal && (
        <div className="modal-backdrop" onClick={() => setShowExModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontFamily: "'Teko', sans-serif", fontSize: 22, letterSpacing: 1 }}>Manage Exercises</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Add or remove exercises from your list</div>
              </div>
              <button className="btn-icon" style={{ fontSize: 18 }} onClick={() => setShowExModal(false)}>✕</button>
            </div>

            {/* Add new */}
            <div style={{ background: "#0f172a", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid var(--border)" }}>
              <div className="label" style={{ marginBottom: 10 }}>Add New Exercise</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 64 }}>
                  <div className="label">Icon</div>
                  <input
                    type="text"
                    value={newExEmoji}
                    onChange={(e) => setNewExEmoji(e.target.value)}
                    maxLength={2}
                    style={{ textAlign: "center", fontSize: 20, padding: "8px 6px" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="label">Name</div>
                  <input
                    type="text"
                    placeholder="e.g. Cable Fly"
                    value={newExName}
                    onChange={(e) => setNewExName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddExercise()}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div className="label">Muscle Group</div>
                <select value={newExGroup} onChange={(e) => setNewExGroup(e.target.value)}>
                  {["Chest","Back","Legs","Arms","Shoulders","Core","Cardio","Other"].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <button className="btn-primary" style={{ width: "100%", padding: 11, fontSize: 14 }}
                onClick={handleAddExercise} disabled={!newExName.trim()}>
                + Add Exercise
              </button>
            </div>

            {/* Current list */}
            <div className="label" style={{ marginBottom: 8 }}>Your Exercises ({exercises.length})</div>
            <div style={{ maxHeight: 280, overflowY: "auto", paddingRight: 2 }}>
              {exercises.map((ex) => {
                const hasData = sessions.some((s) => s.exerciseId === ex.id);
                return (
                  <div key={ex.id} className="ex-manage-row">
                    <span style={{ fontSize: 20, minWidth: 28, textAlign: "center" }}>{ex.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{ex.name}</div>
                      <div style={{ fontSize: 11, color: "var(--faint)", letterSpacing: .5 }}>
                        {ex.group}{hasData && <span style={{ color: "var(--accent)", marginLeft: 6 }}>· has data</span>}
                      </div>
                    </div>
                    <button
                      className="btn-icon"
                      style={{ fontSize: 16 }}
                      onClick={() => setDeleteConfirmId(ex.id)}
                      title="Remove exercise"
                    >🗑</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delete exercise confirm modal */}
      {deleteConfirmId && (() => {
        const ex = exercises.find((e) => e.id === deleteConfirmId);
        const hasData = sessions.some((s) => s.exerciseId === deleteConfirmId);
        return (
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: 360 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🗑️</div>
              <div style={{ fontFamily: "'Teko', sans-serif", fontSize: 22, letterSpacing: 1, marginBottom: 8 }}>
                Remove {ex?.name}?
              </div>
              <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.65, marginBottom: 20 }}>
                {hasData
                  ? <>This exercise has logged data. Removing it <strong style={{ color: "var(--warn)" }}>won't delete your session history</strong>, but the exercise will no longer appear in the picker.</>
                  : <>This exercise has no logged data and will be permanently removed from your list.</>
                }
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn-primary"
                  style={{ flex: 1, background: "var(--danger)" }}
                  onClick={() => handleDeleteExercise(deleteConfirmId)}
                >Remove</button>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setDeleteConfirmId(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}


      <div style={{
        background: "linear-gradient(160deg, #1e293b 0%, #0f172a 100%)",
        borderBottom: "1.5px solid #1e293b",
        padding: "20px 20px 0",
      }}>
        <div style={{ maxWidth: 540, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: "linear-gradient(135deg, #6ee7b7 0%, #38bdf8 100%)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
            }}>🏋️</div>
            <div>
              <div style={{
                fontFamily: "'Teko', sans-serif", fontSize: 28, fontWeight: 600,
                letterSpacing: 2, lineHeight: 1, color: "#f8fafc",
              }}>LIFTLOG</div>
              <div style={{ fontSize: 11, color: "var(--faint)", letterSpacing: .5 }}>
                {sessions.length} sets · {new Set(sessions.map((s) => s.date.slice(0, 10))).size} workout days
              </div>
            </div>
          </div>
          <div style={{ display: "flex" }}>
            {[["log","Log Workout"], ["progress","Progress"], ["data","Export / Import"]].map(([v, label]) => (
              <button key={v} className={`tab-btn ${tab === v ? "active" : ""}`} onClick={() => setTab(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "22px 16px 80px" }}>

        {/* ── LOG TAB ───────────────────────────────────────────────────── */}
        {tab === "log" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Exercise selector */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div className="label" style={{ marginBottom: 0 }}>Choose Exercise</div>
                <button className="btn-add-ex" onClick={() => setShowExModal(true)}>
                  ✏️ Manage
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {exercises.map((ex) => (
                  <button key={ex.id} className={`ex-chip ${selEx === ex.id ? "active" : ""}`}
                    onClick={() => setSelEx(ex.id)}>
                    <span>{ex.emoji}</span>{ex.name}
                  </button>
                ))}
                {exercises.length === 0 && (
                  <div style={{ fontSize: 13, color: "var(--faint)", padding: "4px 0" }}>
                    No exercises yet. Click <strong style={{ color: "var(--accent2)" }}>Manage</strong> to add some.
                  </div>
                )}
              </div>
            </div>

            {/* PR banner */}
            {currentPR > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: 12,
                background: "rgba(110,231,183,.06)",
                border: "1.5px solid rgba(110,231,183,.18)",
              }}>
                <span style={{ fontSize: 24 }}>🏆</span>
                <div>
                  <div style={{ fontSize: 11, color: "var(--accent)", letterSpacing: 1, fontWeight: 600, textTransform: "uppercase" }}>
                    Personal Record
                  </div>
                  <div style={{ fontFamily: "'Teko', sans-serif", fontSize: 24, letterSpacing: 1, color: "#f8fafc", lineHeight: 1.1 }}>
                    {currentPR} lbs — {currentEx?.name}
                  </div>
                </div>
              </div>
            )}

            {/* Form */}
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  ["Weight (lbs)", weight, setWeight, "135", "number", "2.5"],
                  ["Sets",         sets,   setSets,   "3",   "number", "1"],
                  ["Reps",         reps,   setReps,   "10",  "number", "1"],
                ].map(([label, val, setter, ph, type, step]) => (
                  <div key={label}>
                    <div className="label">{label}</div>
                    <input type={type} min="0" step={step} placeholder={ph}
                      value={val} onChange={(e) => setter(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLog()} />
                  </div>
                ))}
              </div>
              <div>
                <div className="label">Notes (optional)</div>
                <input type="text" placeholder="e.g. felt strong, wider grip..."
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLog()} />
              </div>
              <button className="btn-primary" style={{ width: "100%", padding: 14 }}
                onClick={handleLog} disabled={!weight}>
                + Log Set
              </button>
            </div>

            {/* Recent entries for selected exercise */}
            <div>
              <div className="label" style={{ marginBottom: 10 }}>
                Recent — {currentEx?.name}
              </div>
              {recentForEx.length === 0 ? (
                <div style={{
                  textAlign: "center", color: "var(--faint)", fontSize: 13,
                  padding: "20px", border: "1.5px dashed var(--border)", borderRadius: 12,
                }}>
                  No sets logged for {currentEx?.name} yet.<br />
                  <span style={{ color: "var(--muted)" }}>Add your first set above ↑</span>
                </div>
              ) : (
                recentForEx.map((s) => (
                  <div key={s.id} className="log-row">
                    <span style={{ fontSize: 20 }}>{currentEx?.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--accent)" }}>
                        {s.weight} lbs
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {s.sets} sets × {s.reps} reps
                        {s.notes && (
                          <span style={{ color: "var(--faint)" }}> · {s.notes}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--faint)", minWidth: 56, textAlign: "right" }}>
                      {fmtShort(s.date)}
                    </div>
                    <button className="btn-icon" onClick={() => deleteEntry(s.id)} title="Delete">✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── PROGRESS TAB ──────────────────────────────────────────────── */}
        {tab === "progress" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
              Your weight-over-time for each exercise. Green = trending up 💪
            </p>

            {exStats.map((ex) => {
              const noData = ex.logs.length === 0;
              const trendColor = ex.trend > 0 ? "#4ade80" : ex.trend < 0 ? "#f87171" : "#6ee7b7";
              return (
                <div key={ex.id} className="card"
                  style={{ borderLeft: `3px solid ${noData ? "var(--border)" : trendColor}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: noData ? 0 : 14 }}>
                    <span style={{ fontSize: 22 }}>{ex.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{ex.name}</div>
                      <div style={{ fontSize: 11, color: "var(--faint)", letterSpacing: 1 }}>
                        {ex.group.toUpperCase()} · {ex.logs.length} set{ex.logs.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    {ex.pr && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{
                          fontFamily: "'Teko', sans-serif", fontSize: 22,
                          color: "var(--accent)", letterSpacing: 1,
                        }}>{ex.pr} lbs</div>
                        <div style={{ fontSize: 10, color: "var(--faint)" }}>PR</div>
                      </div>
                    )}
                    {ex.trend !== null && (
                      <div style={{ textAlign: "right", minWidth: 48 }}>
                        <div className={ex.trend > 0 ? "trend-up" : ex.trend < 0 ? "trend-down" : "trend-flat"}
                          style={{ fontWeight: 700, fontSize: 15 }}>
                          {ex.trend > 0 ? "▲" : ex.trend < 0 ? "▼" : "—"} {Math.abs(ex.trend)}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--faint)" }}>lbs</div>
                      </div>
                    )}
                  </div>

                  {noData ? (
                    <div style={{ fontSize: 12, color: "var(--faint)" }}>No data yet</div>
                  ) : (
                    <>
                      <Sparkline data={ex.logs} color={trendColor} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--faint)" }}>
                        <span>{fmtShort(ex.logs[0].date)}</span>
                        <span>Latest: <strong style={{ color: "var(--muted)" }}>{ex.latest?.weight} lbs × {ex.latest?.sets}×{ex.latest?.reps}</strong></span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── DATA TAB ──────────────────────────────────────────────────── */}
        {tab === "data" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Export card */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 26 }}>📤</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>Export Workouts</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Save a backup or share with another device</div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, marginBottom: 14 }}>
                Downloads a <strong style={{ color: "var(--accent)" }}>.csv</strong> file with all your logged sets.
                Send it via email, AirDrop, or cloud storage — then import it on any device.
              </p>
              {/* Format preview */}
              <div style={{
                background: "#0f172a", border: "1px dashed var(--border)",
                borderRadius: 8, padding: "10px 14px", marginBottom: 14,
                fontFamily: "monospace", fontSize: 11, color: "var(--faint)",
                overflowX: "auto", whiteSpace: "nowrap",
              }}>
                id, date, exerciseId, weight, sets, reps, notes
              </div>
              <button className="btn-primary" style={{ width: "100%", padding: 13 }}
                onClick={handleExport} disabled={sessions.length === 0}>
                ⬇ Download CSV &nbsp;
                <span style={{ opacity: .7, fontWeight: 400 }}>({sessions.length} entries)</span>
              </button>
            </div>

            {/* Import card */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 26 }}>📥</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>Import Workouts</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Restore from a backup file</div>
                </div>
              </div>
              <div style={{
                background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 14,
                fontSize: 13, color: "var(--warn)", lineHeight: 1.55,
              }}>
                ⚠️ Importing <strong>replaces all current data</strong>. Export first if you want to keep it.
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={handleFileChange} />
              <button className="btn-secondary" style={{ width: "100%", padding: 13, fontSize: 14 }}
                onClick={() => fileRef.current?.click()}>
                📂 Choose CSV File to Import
              </button>
            </div>

            {/* All sessions list */}
            {sessions.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 10 }}>
                  All Logged Sets ({sessions.length})
                </div>
                {sessions.slice(0, 30).map((s) => {
                  const ex = exercises.find((e) => e.id === s.exerciseId);
                  return (
                    <div key={s.id} className="log-row">
                      <span style={{ fontSize: 18 }}>{ex?.emoji ?? "🏋️"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{ex?.name ?? s.exerciseId}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {s.weight} lbs · {s.sets}×{s.reps}
                          {s.notes && <span style={{ color: "var(--faint)" }}> · {s.notes}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--faint)", minWidth: 56, textAlign: "right" }}>
                        {fmtShort(s.date)}
                      </div>
                      <button className="btn-icon" onClick={() => deleteEntry(s.id)}>✕</button>
                    </div>
                  );
                })}
                {sessions.length > 30 && (
                  <div style={{ textAlign: "center", fontSize: 12, color: "var(--faint)", padding: "10px 0" }}>
                    + {sessions.length - 30} more — export CSV to see all
                  </div>
                )}
              </div>
            )}

            {sessions.length === 0 && (
              <div style={{
                textAlign: "center", color: "var(--faint)", fontSize: 13,
                padding: "30px", border: "1.5px dashed var(--border)", borderRadius: 12,
              }}>
                No data yet.<br />
                <span style={{ color: "var(--muted)" }}>Log some workouts first, then export here.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
