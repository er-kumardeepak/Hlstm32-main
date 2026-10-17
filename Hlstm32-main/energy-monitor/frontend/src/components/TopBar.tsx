import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import type { ConnState } from "../hooks/useWebSocket";
import { healthApi } from "../services/api";
import { secondsAgo } from "../utils/format";
import type { Health } from "../types";

interface Props {
  onMenu: () => void;
  conn: ConnState;
  lastReadingAt: string | null;
  deviceId: string;
  onDeviceChange: (id: string) => void;
  devices: { device_id: string; name: string }[];
}

const CONN_STYLES: Record<ConnState, { dot: string; label: string }> = {
  live: { dot: "bg-accent-green", label: "Live" },
  connecting: { dot: "bg-accent-yellow animate-pulse", label: "Reconnecting" },
  offline: { dot: "bg-accent-red", label: "Offline" },
};

export default function TopBar({ onMenu, conn, lastReadingAt, deviceId, onDeviceChange, devices }: Props) {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      healthApi
        .get()
        .then((r) => alive && setHealth(r.data))
        .catch(() => alive && setHealth(null));
    poll();
    const t = setInterval(poll, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const c = CONN_STYLES[conn];

  return (
    <header className="sticky top-0 z-20 border-b-brutal border-ink bg-paper px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onMenu}
          className="rounded-lg border-brutal border-ink bg-white p-2 shadow-brutal-sm lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Energy Monitoring System</h1>

        <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="flex items-center gap-2 rounded-lg border-brutal border-ink bg-white px-3 py-2 font-mono text-xs font-bold shadow-brutal-sm">
            <span className={`h-2.5 w-2.5 rounded-full border border-ink ${c.dot}`} />
            {c.label}
          </span>

          <span className="hidden rounded-lg border-brutal border-ink bg-white px-3 py-2 font-mono text-xs shadow-brutal-sm sm:block">
            API: {health ? (health.status === "ok" ? "OK" : "DOWN") : "?"} · DB: {health?.database ?? "?"}
          </span>

          <span className="rounded-lg border-brutal border-ink bg-white px-3 py-2 font-mono text-xs shadow-brutal-sm">
            Last update: {lastReadingAt ? secondsAgo(lastReadingAt) : "—"}
          </span>

          {devices.length > 0 && (
            <select
              value={deviceId}
              onChange={(e) => onDeviceChange(e.target.value)}
              className="nb-input max-w-[220px] py-2"
              aria-label="Select device"
            >
              {devices.map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </header>
  );
}
