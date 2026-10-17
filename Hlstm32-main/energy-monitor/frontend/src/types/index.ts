/** Shared TypeScript types matching the backend API. */

export interface MeterValues {
  voltage: number;
  current: number;
  power: number;
}

export interface Reading {
  id: number;
  device_id: string;
  timestamp: string;
  em2m_voltage: number | null;
  em2m_current: number | null;
  em2m_power: number | null;
  em4m_voltage: number | null;
  em4m_current: number | null;
  em4m_power: number | null;
  frequency: number | null;
  power_factor: number | null;
  energy_kwh: number | null;
  created_at: string;
}

export interface Device {
  device_id: string;
  name: string;
  location: string;
  created_at: string;
  last_seen: string | null;
  status: "online" | "offline";
}

export type Severity = "critical" | "warning" | "info";

export interface Alert {
  id: number;
  device_id: string;
  reading_id: number | null;
  alert_type: string;
  severity: Severity;
  title: string;
  message: string;
  value: number | null;
  threshold: number | null;
  timestamp: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
}

export interface Health {
  status: string;
  database: string;
  version: string;
}

export interface Stat {
  avg: number;
  min: number;
  max: number;
}

export interface AggregateBucket {
  bucket_start: string;
  interval: string;
  count: number;
  em2m: { voltage: Stat | null; current: Stat | null; power: Stat | null };
  em4m: { voltage: Stat | null; current: Stat | null; power: Stat | null };
}

export type WsEvent =
  | { type: "reading"; data: Reading }
  | { type: "alert"; data: Alert };

/** Thresholds mirror backend env defaults; used to label NORMAL/WARNING/CRITICAL. */
export const THRESHOLDS = {
  LOW_VOLTAGE: 200,
  HIGH_VOLTAGE: 250,
  EM2M_MAX_CURRENT: 10,
  EM2M_MAX_POWER: 2200,
  EM4M_MAX_CURRENT: 20,
  EM4M_MAX_POWER: 5000,
  DEVICE_OFFLINE_SECONDS: 30,
};

export type MeterKey = "em2m" | "em4m";
export type SeriesKey = "voltage" | "current" | "power";
