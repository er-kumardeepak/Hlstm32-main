import { useEffect, useMemo, useState } from "react";
import { LineChart } from "lucide-react";
import { readingsApi } from "../services/api";
import type { AggregateBucket } from "../types";
import { EmptyState, PageHeader, SkeletonBlock } from "../components/ui";
import ChartCard from "../components/ChartCard";
import type { Reading, SeriesKey } from "../types";
import { useDashboard } from "../state/DashboardContext";

const RANGES = [
  { label: "Last 15 min", minutes: 15, interval: "1min" },
  { label: "Last hour", minutes: 60, interval: "1min" },
  { label: "Last 6 hours", minutes: 360, interval: "15min" },
  { label: "Last 24 hours", minutes: 1440, interval: "1hour" },
  { label: "Last 7 days", minutes: 10080, interval: "1day" },
];

export default function Analytics() {
  const { deviceId } = useDashboard();
  const [range, setRange] = useState(0);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [buckets, setBuckets] = useState<AggregateBucket[]>([]);
  const [raw, setRaw] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    if (custom) {
      readingsApi
        .history({ device_id: deviceId, from: custom.from, to: custom.to, limit: 2000 })
        .then((r) => {
          setRaw(r.data);
          setBuckets([]);
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
      return;
    }
    const { minutes, interval } = RANGES[range];
    Promise.all([
      readingsApi.aggregate({ device_id: deviceId, interval, minutes }),
      readingsApi.history({ device_id: deviceId, limit: 500 }),
    ])
      .then(([agg, hist]) => {
        setBuckets(agg.data);
        setRaw(hist.data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [range, custom, deviceId]);

  const chartData: Reading[] = useMemo(() => {
    if (custom) return raw.slice().reverse();
    // Convert aggregate buckets to chart-friendly rows
    return buckets.map((b) => ({
      id: -1,
      device_id: deviceId,
      timestamp: b.bucket_start,
      em2m_voltage: b.em2m.voltage?.avg ?? null,
      em2m_current: b.em2m.current?.avg ?? null,
      em2m_power: b.em2m.power?.avg ?? null,
      em4m_voltage: b.em4m.voltage?.avg ?? null,
      em4m_current: b.em4m.current?.avg ?? null,
      em4m_power: b.em4m.power?.avg ?? null,
      frequency: null,
      power_factor: null,
      energy_kwh: null,
      created_at: b.bucket_start,
    }));
  }, [buckets, raw, custom, deviceId]);

  const stats: Record<SeriesKey, Record<"em2m" | "em4m", { avg: number; min: number; max: number } | null>> =
    useMemo(() => {
      const calc = (get: (r: Reading) => number | null) => {
        const vals = chartData.map(get).filter((v): v is number => v !== null);
        if (!vals.length) return null;
        return {
          avg: vals.reduce((a, b) => a + b, 0) / vals.length,
          min: Math.min(...vals),
          max: Math.max(...vals),
        };
      };
      return {
        voltage: { em2m: calc((r) => r.em2m_voltage), em4m: calc((r) => r.em4m_voltage) },
        current: { em2m: calc((r) => r.em2m_current), em4m: calc((r) => r.em4m_current) },
        power: { em2m: calc((r) => r.em2m_power), em4m: calc((r) => r.em4m_power) },
      };
    }, [chartData]);

  const fmt = (v: number | null, unit: string) => (v === null ? "—" : `${v.toFixed(2)} ${unit}`);

  const unit: Record<SeriesKey, string> = { voltage: "V", current: "A", power: "W" };

  return (
    <div>
      <PageHeader
        title="Analytics"
        hint="Historical trends computed from stored readings."
        actions={
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r, i) => (
              <button key={r.label} onClick={() => { setCustom(null); setRange(i); }}
                className={`nb-btn px-3 py-1.5 text-xs ${!custom && range === i ? "bg-accent-yellow" : ""}`}>
                {r.label}
              </button>
            ))}
            <button onClick={() => setCustom({ from: "", to: "" })}
              className={`nb-btn px-3 py-1.5 text-xs ${custom ? "bg-accent-blue" : ""}`}>
              Custom
            </button>
          </div>
        }
      />

      {custom && (
        <div className="nb-card mb-5 flex flex-wrap items-end gap-3 p-4">
          <label className="text-xs font-bold uppercase">
            From
            <input type="datetime-local" className="nb-input mt-1 block" value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          </label>
          <label className="text-xs font-bold uppercase">
            To
            <input type="datetime-local" className="nb-input mt-1 block" value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </label>
          <button
            className="nb-btn bg-accent-yellow"
            onClick={() => {
              if (custom.from && custom.to) {
                setCustom({
                  from: new Date(custom.from).toISOString(),
                  to: new Date(custom.to).toISOString(),
                });
              }
            }}
          >
            Apply
          </button>
        </div>
      )}

      {error && <EmptyState title="Could not load analytics" hint="Is the backend running? Check the API status in the top bar." />}
      {loading ? (
        <SkeletonBlock />
      ) : chartData.length === 0 && !error ? (
        <EmptyState title="No data in this range" hint="Run the mock device to generate data: python mock_device.py" />
      ) : (
        <div className="flex flex-col gap-5">
          {(["voltage", "current", "power"] as SeriesKey[]).map((s) => (
            <div key={s} className="nb-card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-bold"><LineChart className="h-5 w-5" /> {s === "power" ? "Active Power" : s[0].toUpperCase() + s.slice(1)} {custom ? "(raw)" : "(average per interval)"}</h3>
                <div className="flex gap-2 font-mono text-xs">
                  {(["em2m", "em4m"] as const).map((m) => {
                    const st = stats[s][m];
                    return st ? (
                      <span key={m} className="rounded-md border-brutal border-ink bg-white px-2 py-1 shadow-brutal-sm">
                        {m.toUpperCase()} avg {fmt(st.avg, unit[s])} · min {fmt(st.min, unit[s])} · max {fmt(st.max, unit[s])}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
              <ChartCard readings={chartData} series={s} meters="both" height={260} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
