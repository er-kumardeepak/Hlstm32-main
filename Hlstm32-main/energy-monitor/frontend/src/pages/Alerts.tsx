import { useEffect, useState } from "react";
import { Bell, Check, Filter } from "lucide-react";
import { alertsApi } from "../services/api";
import type { Alert, Severity } from "../types";
import { EmptyState, PageHeader, StatusBadge } from "../components/ui";
import { dateTime } from "../utils/format";
import { useDashboard } from "../state/DashboardContext";

export default function Alerts() {
  const { alerts, acknowledge, deviceId } = useDashboard();
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [onlyUnacked, setOnlyUnacked] = useState(false);
  const [bump, setBump] = useState(false); // toggles refetch on filter change

  useEffect(() => {
    const params: { severity?: string; acknowledged?: boolean; device_id?: string; limit?: number } = {
      device_id: deviceId,
      limit: 200,
    };
    if (severity !== "all") params.severity = severity;
    if (onlyUnacked) params.acknowledged = false;
    alertsApi.list(params).catch(() => undefined);
  }, [severity, onlyUnacked, deviceId, bump]);

  const visible = alerts.filter(
    (a) =>
      (severity === "all" || a.severity === severity) &&
      (!onlyUnacked || !a.acknowledged)
  );

  return (
    <div>
      <PageHeader
        title="Alerts"
        hint="Rule-based threshold alerts with cooldown deduplication."
        actions={
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1 font-mono text-xs font-bold uppercase opacity-60">
              <Filter className="h-4 w-4" /> Filters:
            </span>
            {(["all", "critical", "warning", "info"] as const).map((s) => (
              <button key={s} onClick={() => setSeverity(s)}
                className={`nb-btn px-3 py-1.5 font-mono text-xs ${severity === s ? "bg-accent-yellow" : ""}`}>
                {s.toUpperCase()}
              </button>
            ))}
            <button onClick={() => setOnlyUnacked(!onlyUnacked)}
              className={`nb-btn px-3 py-1.5 font-mono text-xs ${onlyUnacked ? "bg-accent-blue" : ""}`}>
              Unacked only
            </button>
            <button onClick={() => setBump((b) => !b)}
              className="nb-btn px-3 py-1.5 font-mono text-xs">
              Refresh
            </button>
          </div>
        }
      />

      {visible.length === 0 ? (
        <EmptyState title="No alerts" hint="Alerts appear when voltage, current or power cross the configured thresholds." />
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((a) => (
            <AlertCard key={a.id} alert={a} onAck={() => acknowledge(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert, onAck }: { alert: Alert; onAck: () => void }) {
  const sevAccent = alert.severity === "critical" ? "bg-accent-red" : alert.severity === "warning" ? "bg-accent-yellow" : "bg-accent-blue";
  return (
    <div className={`nb-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center ${alert.severity === "critical" ? "border-brutal" : ""}`}>
      <div className={`self-start rounded-lg border-brutal border-ink px-3 py-2 font-mono text-xs font-bold uppercase shadow-brutal-sm ${sevAccent}`}>
        {alert.severity}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{alert.title}</p>
        <p className="mt-0.5 text-sm opacity-80">{alert.message}</p>
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">
          <span className="rounded-md border-brutal border-ink bg-white px-2 py-0.5 shadow-brutal-sm">{dateTime(alert.timestamp)}</span>
          <span className="rounded-md border-brutal border-ink bg-white px-2 py-0.5 shadow-brutal-sm">{alert.device_id}</span>
          {alert.value !== null && alert.threshold !== null && (
            <span className="rounded-md border-brutal border-ink bg-white px-2 py-0.5 shadow-brutal-sm">
              measured {alert.value.toFixed(2)} · limit {alert.threshold.toFixed(2)}
            </span>
          )}
          <span className="rounded-md border-brutal border-ink bg-white px-2 py-0.5 font-bold shadow-brutal-sm">{alert.alert_type}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {alert.acknowledged ? (
          <StatusBadge label="ACKNOWLEDGED" tone="info" />
        ) : (
          <button onClick={onAck} className="nb-btn bg-accent-green px-3 py-2 text-sm">
            <Check className="h-4 w-4" strokeWidth={2.5} /> Acknowledge
          </button>
        )}
      </div>
    </div>
  );
}

export { Bell };
