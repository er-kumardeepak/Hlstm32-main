import { Activity, BarChart3, BatteryCharging, BrainCircuit, ChevronRight, Gauge, Waves, Zap } from "lucide-react";
import { useState } from "react";
import { useDashboard } from "../state/DashboardContext";
import { MetricCard, PageHeader, PlaceholderCard, SkeletonCard } from "../components/ui";
import ChartCard from "../components/ChartCard";
import type { MeterKey, SeriesKey } from "../types";
import { THRESHOLDS } from "../types";
import { dateTime, secondsAgo, watts } from "../utils/format";

const ACCENTS = ["bg-accent-yellow", "bg-accent-green", "bg-accent-blue", "bg-accent-purple", "bg-accent-red"];

function voltageStatus(v: number | null) {
  if (v === null) return "normal";
  if (v < THRESHOLDS.LOW_VOLTAGE || v > THRESHOLDS.HIGH_VOLTAGE) return "warning";
  return "normal";
}
function currentStatus(m: MeterKey, i: number | null) {
  const max = m === "em2m" ? THRESHOLDS.EM2M_MAX_CURRENT : THRESHOLDS.EM4M_MAX_CURRENT;
  return i !== null && i > max ? "critical" : "normal";
}
function powerStatus(m: MeterKey, p: number | null) {
  const max = m === "em2m" ? THRESHOLDS.EM2M_MAX_POWER : THRESHOLDS.EM4M_MAX_POWER;
  return p !== null && p > max ? "critical" : "normal";
}

export default function Overview() {
  const { latest, history, alerts, conn, devices } = useDashboard();
  const [series, setSeries] = useState<SeriesKey>("power");
  const [meterFilter, setMeterFilter] = useState<"em2m" | "em4m" | "both">("both");

  if (!latest) {
    return (
      <div>
        <PageHeader title="Overview" />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  const online = devices.filter((d) => d.status === "online").length;
  const totalPower = (latest.em2m_power ?? 0) + (latest.em4m_power ?? 0);
  const unacked = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div>
      <PageHeader
        title="Overview"
        hint={`Device ${latest.device_id} · last reading ${dateTime(latest.timestamp)} (${secondsAgo(latest.timestamp)})`}
      />

      {conn !== "live" && (
        <div className="mb-5 rounded-lg border-brutal border-ink bg-accent-yellow px-4 py-3 font-mono text-sm font-bold shadow-brutal">
          ⚠ Connection lost — values shown are the last known readings. Trying to reconnect…
        </div>
      )}

      {/* Meter cards */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={Gauge} title="EM2M Voltage" value={(latest.em2m_voltage?.toFixed(1)) ?? "—"} unit="V"
          subtitle={`Single-phase meter · updated ${secondsAgo(latest.timestamp)}`}
          status={voltageStatus(latest.em2m_voltage)} accent={ACCENTS[0]} />
        <MetricCard icon={Activity} title="EM2M Current" value={(latest.em2m_current?.toFixed(2)) ?? "—"} unit="A"
          subtitle={`Limit ${THRESHOLDS.EM2M_MAX_CURRENT} A`}
          status={currentStatus("em2m", latest.em2m_current)} accent={ACCENTS[1]} />
        <MetricCard icon={Zap} title="EM2M Active Power" value={watts(latest.em2m_power)} unit=""
          subtitle={`Limit ${watts(THRESHOLDS.EM2M_MAX_POWER)}`}
          status={powerStatus("em2m", latest.em2m_power)} accent={ACCENTS[2]} />
        <MetricCard icon={Gauge} title="EM4M Voltage" value={(latest.em4m_voltage?.toFixed(1)) ?? "—"} unit="V"
          subtitle={`Three-phase meter · updated ${secondsAgo(latest.timestamp)}`}
          status={voltageStatus(latest.em4m_voltage)} accent={ACCENTS[3]} />
        <MetricCard icon={Activity} title="EM4M Current" value={(latest.em4m_current?.toFixed(2)) ?? "—"} unit="A"
          subtitle={`Limit ${THRESHOLDS.EM4M_MAX_CURRENT} A`}
          status={currentStatus("em4m", latest.em4m_current)} accent={ACCENTS[4]} />
        <MetricCard icon={Zap} title="EM4M Active Power" value={watts(latest.em4m_power)} unit=""
          subtitle={`Limit ${watts(THRESHOLDS.EM4M_MAX_POWER)}`}
          status={powerStatus("em4m", latest.em4m_power)} accent={ACCENTS[0]} />
      </div>

      {/* System summary */}
      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="nb-card bg-accent-yellow p-5">
          <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider"><BatteryCharging className="h-4 w-4" strokeWidth={2.5} /> Total Active Power</p>
          <p className="mt-1 font-mono text-4xl font-bold">{watts(totalPower)}</p>
          <p className="mt-2 text-xs opacity-70">EM2M + EM4M combined</p>
        </div>
        <div className="nb-card p-5">
          <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider"><Waves className="h-4 w-4" strokeWidth={2.5} /> System Status</p>
          <p className="mt-1 font-mono text-2xl font-bold">{conn === "live" ? "STREAMING" : "NO LIVE DATA"}</p>
          <p className="mt-2 text-xs opacity-70">WebSocket {conn}</p>
        </div>
        <div className="nb-card p-5">
          <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider"><BarChart3 className="h-4 w-4" strokeWidth={2.5} /> Active Alerts</p>
          <p className="mt-1 font-mono text-4xl font-bold">{unacked}</p>
          <p className="mt-2 text-xs opacity-70">unacknowledged of {alerts.length} total</p>
        </div>
        <div className="nb-card p-5">
          <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider"><ChevronRight className="h-4 w-4" strokeWidth={2.5} /> Device Connectivity</p>
          <p className="mt-1 font-mono text-4xl font-bold">{online}/{devices.length}</p>
          <p className="mt-2 text-xs opacity-70">devices reporting</p>
        </div>
      </div>

      {/* Live chart */}
      <div className="nb-card mt-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold"><BrainCircuit className="h-5 w-5" /> Live Trend — {series === "power" ? "Active Power" : series === "current" ? "Current" : "Voltage"} (last {history.length} readings)</h3>
          <div className="flex flex-wrap gap-2">
            {(["voltage", "current", "power"] as SeriesKey[]).map((s) => (
              <button key={s} onClick={() => setSeries(s)}
                className={`nb-btn px-3 py-1.5 text-xs ${series === s ? "bg-accent-yellow" : ""}`}>
                {s}
              </button>
            ))}
            {(["em2m", "em4m", "both"] as const).map((m) => (
              <button key={m} onClick={() => setMeterFilter(m)}
                className={`nb-btn px-3 py-1.5 font-mono text-xs ${meterFilter === m ? "bg-accent-blue text-ink" : ""}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {history.length ? <ChartCard readings={history} series={series} meters={meterFilter} /> : <p className="p-6 text-sm opacity-60">Waiting for readings…</p>}
      </div>

      {/* Predictive Intelligence placeholder (no fake ML values by design) */}
      <div className="mt-6">
        <h3 className="mb-4 flex items-center gap-2 text-xl font-bold"><BrainCircuit className="h-6 w-6" /> Predictive Intelligence</h3>
        <p className="mb-4 max-w-2xl text-sm opacity-70">
          ML prediction will become available after sufficient historical data has been collected.
        </p>
        <div className="grid gap-5 md:grid-cols-3">
          <PlaceholderCard title="Load Forecast" note="Next 15 / 30 / 60 min load prediction" />
          <PlaceholderCard title="Voltage Forecast" note="Future voltage trend prediction" />
          <PlaceholderCard title="Anomaly Detection" note="Abnormal load and voltage detection" />
        </div>
      </div>
    </div>
  );
}
