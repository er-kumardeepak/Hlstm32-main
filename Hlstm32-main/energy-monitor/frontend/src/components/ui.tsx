import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Severity = "critical" | "warning" | "info";

const SEV_STYLES: Record<Severity, string> = {
  critical: "bg-accent-red text-ink",
  warning: "bg-accent-yellow text-ink",
  info: "bg-accent-blue text-ink",
};

export function StatusBadge({ label, tone }: { label: string; tone: Severity | "normal" | "online" | "offline" }) {
  const map: Record<string, string> = {
    normal: "bg-accent-green",
    online: "bg-accent-green",
    offline: "bg-white",
    ...SEV_STYLES,
  };
  return (
    <span className={`inline-block rounded-md border-brutal border-ink px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider shadow-brutal-sm ${map[tone] ?? "bg-white"}`}>
      {label}
    </span>
  );
}

export function severityTone(s: Severity): Severity {
  return s;
}

export function MetricCard({
  icon: Icon,
  title,
  value,
  unit,
  subtitle,
  status,
  accent,
}: {
  icon: LucideIcon;
  title: string;
  value: ReactNode;
  unit: string;
  subtitle: string;
  status: Severity | "normal";
  accent: string;
}) {
  return (
    <div className="nb-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg border-brutal border-ink shadow-brutal-sm ${accent}`}>
          <Icon className="h-6 w-6" strokeWidth={2.5} />
        </div>
        <StatusBadge label={status === "normal" ? "NORMAL" : status} tone={status} />
      </div>
      <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider opacity-60">{title}</p>
      <p className="mt-1 font-mono text-4xl font-bold tracking-tight">
        {value}
        <span className="ml-1.5 text-base font-semibold opacity-60">{unit}</span>
      </p>
      <p className="mt-2 text-xs opacity-70">{subtitle}</p>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="nb-card animate-pulse p-5">
      <div className="h-11 w-11 rounded-lg bg-ink/10" />
      <div className="mt-4 h-3 w-20 rounded bg-ink/10" />
      <div className="mt-2 h-9 w-28 rounded bg-ink/10" />
      <div className="mt-2 h-3 w-24 rounded bg-ink/10" />
    </div>
  );
}

export function SkeletonBlock({ className = "h-72" }: { className?: string }) {
  return <div className={`nb-card animate-pulse ${className}`} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="nb-card flex flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="font-bold">{title}</p>
      {hint && <p className="max-w-sm text-sm opacity-70">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {hint && <p className="mt-1 text-sm opacity-70">{hint}</p>}
      </div>
      {actions}
    </div>
  );
}

export function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="nb-card bg-white/60 p-5">
      <p className="font-bold">{title}</p>
      <p className="mt-1 font-mono text-xs opacity-70">{note}</p>
      <div className="mt-4 border-brutal border-dashed border-ink/40 rounded-lg p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-wider opacity-60">Collecting data...</p>
      </div>
    </div>
  );
}
