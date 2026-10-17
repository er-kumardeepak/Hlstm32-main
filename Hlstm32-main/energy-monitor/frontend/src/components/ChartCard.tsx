import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Reading, SeriesKey } from "../types";
import { dateTime } from "../utils/format";

type MeterFilter = "em2m" | "em4m" | "both";

const METER_META = {
  em2m: { key: "em2m", prefix: "em2m_", name: "EM2M", color: "#111111" },
  em4m: { key: "em4m", prefix: "em4m_", name: "EM4M", color: "#5B8DEF" },
} as const;

const SERIES_BLOCK: Record<SeriesKey, string> = {
  voltage: "Voltage",
  current: "Current",
  power: "Power",
};

interface Props {
  readings: Reading[];
  series: SeriesKey;
  meters: MeterFilter;
  height?: number;
}

export default function ChartCard({ readings, series, meters, height = 320 }: Props) {
  const activeMeters = meters === "both" ? (["em2m", "em4m"] as const) : ([meters] as const);

  const data = readings.map((r) => {
    const row: Record<string, number | string> = { t: r.timestamp };
    for (const m of activeMeters) {
      const v = r[`${MET_KEY(m)}_${propertyKey(series)}` as keyof Reading] as number | null;
      if (v !== null && v !== undefined) row[METER_META[m].name] = v;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#11111122" />
        <XAxis
          dataKey="t"
          tickFormatter={(t: string) => dateTime(t).slice(-8, -3)}
          tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}
          stroke="#111111"
          minTickGap={40}
        />
        <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} stroke="#111111" width={48} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{
            background: "#fff",
            border: "2px solid #111",
            borderRadius: 8,
            boxShadow: "4px 4px 0 0 #111",
            fontFamily: "IBM Plex Mono",
            fontSize: 12,
          }}
          labelFormatter={(t: string) => dateTime(t)}
          formatter={(value: number, name: string) => [
            `${value} ${unitFor(series)}`,
            `${name} · ${SERIES_BLOCK[series]}`,
          ]}
        />
        <Legend wrapperStyle={{ fontFamily: "IBM Plex Mono", fontSize: 12 }} />
        {activeMeters.map((m) => (
          <Line
            key={m}
            type="monotone"
            dataKey={METER_META[m].name}
            name={METER_META[m].name}
            stroke={m === "em2m" ? "#111111" : "#5B8DEF"}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function MET_KEY(m: "em2m" | "em4m") {
  return m === "em2m" ? "em2m" : "em4m";
}
function propertyKey(s: SeriesKey) {
  return s === "voltage" ? "voltage" : s === "current" ? "current" : "power";
}
function unitFor(s: SeriesKey) {
  return s === "voltage" ? "V" : s === "current" ? "A" : "W";
}
