import { useState } from "react";
import { Monitor } from "lucide-react";
import { useDashboard } from "../state/DashboardContext";
import { EmptyState, PageHeader, SkeletonBlock } from "../components/ui";
import ChartCard from "../components/ChartCard";
import type { SeriesKey } from "../types";
import { dateTime, secondsAgo } from "../utils/format";

const VIEW_OPTIONS = [
  { label: "Last 60 readings", cap: 60 },
  { label: "Last 5 minutes", cap: Infinity, maxAgeSec: 300 },
  { label: "Last 15 minutes", cap: Infinity, maxAgeSec: 900 },
];

export default function LiveMonitor() {
  const { history, latest, conn } = useDashboard();
  const [series] = useState<SeriesKey[]>(["voltage", "current", "power"]);
  const [meterFilter, setMeterFilter] = useState<"em2m" | "em4m" | "both">("both");
  const [view, setView] = useState(0);

  const opt = VIEW_OPTIONS[view];
  const cut = opt.maxAgeSec ? Date.now() - opt.maxAgeSec * 1000 : Infinity;
  const readings = history.filter((r, idx) => idx >= history.length - opt.cap && (opt.maxAgeSec ? new Date(r.timestamp).getTime() >= cut || true : true)).slice(-opt.cap);

  return (
    <div>
      <PageHeader
        title="Live Monitor"
        hint={
          latest
            ? `Streaming ${latest.device_id} · last packet ${dateTime(latest.timestamp)} (${secondsAgo(latest.timestamp)})`
            : "Waiting for first reading…"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {(["em2m", "em4m", "both"] as const).map((m) => (
              <button key={m} onClick={() => setMeterFilter(m)}
                className={`nb-btn px-3 py-1.5 font-mono text-xs ${meterFilter === m ? "bg-accent-yellow" : ""}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        }
      />

      {!latest ? (
        <>
          <SkeletonBlock />
          <div className="mt-5"><SkeletonBlock /></div>
          <div className="mt-5"><SkeletonBlock /></div>
        </>
      ) : conn === "offline" ? (
        <EmptyState title="No live data" hint="The dashboard last received data a moment ago. Reconnecting to the WebSocket…" />
      ) : (
        <div className="flex flex-col gap-5">
          {series.map((s) => (
            <div key={s} className="nb-card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-bold"><Monitor className="h-5 w-5" /> {s === "power" ? "Active Power" : s[0].toUpperCase() + s.slice(1)}</h3>
                <div className="flex gap-1.5">
                  {VIEW_OPTIONS.map((o, i) => (
                    <button key={o.label} onClick={() => setView(i)}
                      className={`nb-btn px-2.5 py-1 font-mono text-[11px] ${view === i ? "bg-accent-blue" : ""}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {readings.length ? (
                <ChartCard readings={readings} series={s} meters={meterFilter} height={280} />
              ) : (
                <p className="py-10 text-center text-sm opacity-60">No readings in this window yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
