import { useState } from "react";
import { Plug, PlugZap, Radio } from "lucide-react";
import { useDashboard } from "../state/DashboardContext";
import { EmptyState, PageHeader, SkeletonCard } from "../components/ui";
import { dateTime, secondsAgo } from "../utils/format";

export default function Devices() {
  const { devices, latest } = useDashboard();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title="Devices" hint="Registered energy-monitor devices and their meters." />
      {devices.length === 0 ? (
        <EmptyState title="No devices registered yet" hint="Devices auto-register when the first reading arrives from the mock device or Raspberry Pi." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => (
            <div key={d.device_id} className="nb-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border-brutal border-ink bg-accent-yellow shadow-brutal-sm">
                  <PlugZap className="h-6 w-6" strokeWidth={2.5} />
                </div>
                <span className={`rounded-md border-brutal border-ink px-2 py-0.5 font-mono text-[11px] font-bold uppercase shadow-brutal-sm ${d.status === "online" ? "bg-accent-green" : "bg-white"}`}>
                  {d.status}
                </span>
              </div>
              <p className="mt-4 text-lg font-bold">{d.name}</p>
              <p className="font-mono text-xs opacity-70">{d.device_id}</p>
              <dl className="mt-3 space-y-1 font-mono text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="opacity-60">Last seen</dt>
                  <dd className="text-right font-bold">{secondsAgo(d.last_seen)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="opacity-60">Registered</dt>
                  <dd className="text-right">{dateTime(d.created_at)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="opacity-60">Location</dt>
                  <dd className="text-right">{d.location || "—"}</dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2">
                <span className="flex items-center gap-1 rounded-md border-brutal border-ink bg-white px-2 py-1 font-mono text-[11px] font-bold shadow-brutal-sm"><Plug className="h-3 w-3" /> EM2M</span>
                <span className="flex items-center gap-1 rounded-md border-brutal border-ink bg-white px-2 py-1 font-mono text-[11px] font-bold shadow-brutal-sm"><Radio className="h-3 w-3" /> EM4M</span>
                <button
                  onClick={() => setSelected(selected === d.device_id ? null : d.device_id)}
                  className="nb-btn ml-auto px-3 py-1 text-xs"
                >
                  {selected === d.device_id ? "Close" : "Details"}
                </button>
              </div>
              {selected === d.device_id && (
                <div className="mt-4 rounded-lg border-brutal border-dashed border-ink/50 p-3 font-mono text-xs">
                  <p className="font-bold uppercase opacity-70">Latest reading</p>
                  {latest && latest.device_id === d.device_id ? (
                    <table className="mt-2 w-full">
                      <thead>
                        <tr className="opacity-60 text-left">
                          <th>Meter</th><th>V</th><th>A</th><th>W</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>EM2M</td>
                          <td>{latest.em2m_voltage ?? "—"}</td>
                          <td>{latest.em2m_current ?? "—"}</td>
                          <td>{latest.em2m_power ?? "—"}</td>
                        </tr>
                        <tr>
                          <td>EM4M</td>
                          <td>{latest.em4m_voltage ?? "—"}</td>
                          <td>{latest.em4m_current ?? "—"}</td>
                          <td>{latest.em4m_power ?? "—"}</td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <p className="mt-2 opacity-60">No reading yet for this device.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {devices.length === 0 && (
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
    </div>
  );
}
