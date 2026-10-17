import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
  LayoutDashboard,
  LineChart,
  Monitor,
  PlugZap,
  Settings,
  X,
  Zap,
} from "lucide-react";
import TopBar from "./TopBar";
import { useDashboard } from "../state/DashboardContext";

const PAGES = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/live", label: "Live Monitor", icon: Monitor },
  { to: "/analytics", label: "Analytics", icon: LineChart },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/devices", label: "Devices", icon: PlugZap },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { deviceId, setDeviceId, devices, conn, lastReadingAt } = useDashboard();

  const links = (
    <nav className="flex flex-col gap-3">
      {PAGES.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 border-brutal border-ink rounded-lg px-4 py-3 font-semibold shadow-brutal-sm transition-all ${
              isActive
                ? "bg-accent-yellow text-ink -translate-x-0.5 -translate-y-0.5 shadow-brutal"
                : "bg-white hover:bg-accent-yellow/30"
            }`
          }
        >
          <Icon className="h-5 w-5" strokeWidth={2.5} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-paper">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-brutal border-ink bg-accent-yellow p-5 lg:flex">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border-brutal border-ink bg-white shadow-brutal-sm">
            <Zap className="h-6 w-6 text-ink" strokeWidth={2.75} />
          </div>
          <div>
            <p className="font-bold leading-tight">Energy</p>
            <p className="-mt-0.5 font-mono text-xs uppercase tracking-wide">Monitor v1.0</p>
          </div>
        </div>
        {links}
        <div className="mt-auto rounded-lg border-brutal border-ink bg-white p-4 shadow-brutal-sm">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
            <BrainCircuit className="h-4 w-4" /> Predictive Intelligence
          </p>
          <p className="mt-2 text-xs leading-snug opacity-70">
            ML forecasting appears here once enough history is collected.
          </p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-brutal border-ink bg-accent-yellow p-5 shadow-brutal-lg">
            <button
              onClick={() => setOpen(false)}
              className="mb-6 flex items-center gap-2 rounded-lg border-brutal border-ink bg-white px-3 py-2 font-bold shadow-brutal-sm"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" /> Close
            </button>
            {links}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <TopBar
          onMenu={() => setOpen(true)}
          conn={conn}
          lastReadingAt={lastReadingAt}
          deviceId={deviceId}
          onDeviceChange={setDeviceId}
          devices={devices}
        />
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export { Activity, AlertTriangle };
