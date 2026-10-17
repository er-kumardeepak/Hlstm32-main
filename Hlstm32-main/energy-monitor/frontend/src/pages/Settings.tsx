import { Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { PageHeader } from "../components/ui";
import { THRESHOLDS } from "../types";

interface Row {
  label: string;
  value: string;
}

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Voltage thresholds (both meters)",
    rows: [
      { label: "Low voltage warning", value: `${THRESHOLDS.LOW_VOLTAGE} V` },
      { label: "High voltage warning", value: `${THRESHOLDS.HIGH_VOLTAGE} V` },
    ],
  },
  {
    title: "EM2M (single phase)",
    rows: [
      { label: "Max current (critical)", value: `${THRESHOLDS.EM2M_MAX_CURRENT} A` },
      { label: "Max power (critical)", value: `${THRESHOLDS.EM2M_MAX_POWER} W` },
    ],
  },
  {
    title: "EM4M (three phase)",
    rows: [
      { label: "Max current (critical)", value: `${THRESHOLDS.EM4M_MAX_CURRENT} A` },
      { label: "Max power (critical)", value: `${THRESHOLDS.EM4M_MAX_POWER} W` },
    ],
  },
  {
    title: "System behaviour",
    rows: [
      { label: "Device offline after", value: `${THRESHOLDS.DEVICE_OFFLINE_SECONDS} s without data` },
      { label: "Alert cooldown", value: "300 s (backend env ALERT_COOLDOWN_SECONDS)" },
      { label: "API security", value: "X-API-Key optional (set DEVICE_API_KEY on backend)" },
    ],
  },
];

export default function Settings() {
  return (
    <div>
      <PageHeader
        title="Settings"
        hint="Thresholds are configured with environment variables in backend/.env. This page reflects the active values."
        actions={<span className="rounded-md border-brutal border-ink bg-accent-green px-3 py-1.5 font-mono text-xs font-bold shadow-brutal-sm"><ShieldCheck className="mr-1 inline h-4 w-4" /> READ-ONLY</span>}
      />
      <div className="grid gap-5 md:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title} className="nb-card p-5">
            <h3 className="flex items-center gap-2 font-bold"><SettingsIcon className="h-5 w-5" /> {g.title}</h3>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.label} className="border-b border-ink/10 last:border-0">
                    <td className="py-2 opacity-70">{r.label}</td>
                    <td className="py-2 text-right font-mono font-bold">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="nb-card mt-5 p-5">
        <h3 className="font-bold">Environment reference</h3>
        <pre className="mt-3 overflow-x-auto rounded-lg border-brutal border-ink bg-ink p-4 font-mono text-xs leading-relaxed text-accent-green">{`backend/.env
DATABASE_URL=postgresql://postgres:password@localhost:5432/energy_monitor
ALLOWED_ORIGINS=http://localhost:5173
LOW_VOLTAGE_THRESHOLD=200      HIGH_VOLTAGE_THRESHOLD=250
EM2M_MAX_CURRENT=10            EM2M_MAX_POWER=2200
EM4M_MAX_CURRENT=20            EM4M_MAX_POWER=5000
DEVICE_OFFLINE_SECONDS=30      ALERT_COOLDOWN_SECONDS=300`}</pre>
      </div>
    </div>
  );
}
