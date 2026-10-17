/** Central real-time state: devices, selected device, rolling readings, alerts. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Alert, Device, Reading } from "../types";
import { alertsApi, devicesApi, readingsApi } from "../services/api";
import { useWebSocket, type ConnState } from "../hooks/useWebSocket";

const ROLLING_WINDOW = 60; // keep last N readings per selected device

interface DashboardState {
  deviceId: string;
  setDeviceId: (id: string) => void;
  devices: Device[];
  latest: Reading | null;
  history: Reading[]; // newest last (chart order)
  alerts: Alert[];
  conn: ConnState;
  lastReadingAt: string | null;
  acknowledge: (id: number) => void;
}

const Ctx = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("energy-monitor-01");
  const [latest, setLatest] = useState<Reading | null>(null);
  const [history, setHistory] = useState<Reading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const deviceIdRef = useRef(deviceId);

  // Initial load: devices, alerts, latest reading and recent history.
  useEffect(() => {
    devicesApi
      .list()
      .then((r) => {
        setDevices(r.data);
        const first = r.data[0]?.device_id;
        if (r.data.length) setDeviceId((cur) => (cur || first)!);
      })
      .catch(() => undefined);
    alertsApi
      .list({ limit: 100 })
      .then((r) => setAlerts(r.data))
      .catch(() => undefined);
  }, []);

  const loadDeviceData = useCallback(() => {
    readingsApi
      .latest(deviceIdRef.current)
      .then((r) => setLatest(r.data))
      .catch(() => setLatest(null));
    readingsApi
      .history({ device_id: deviceIdRef.current, limit: ROLLING_WINDOW })
      .then((r) => setHistory(r.data.reverse()))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    deviceIdRef.current = deviceId;
    loadDeviceData();
  }, [deviceId, loadDeviceData]);

  const onEvent = useCallback((ev: { type: string; data: unknown }) => {
    if (ev.type === "reading") {
      const reading = ev.data as Reading;
      if (reading.device_id !== deviceIdRef.current) return;
      setLatest(reading);
      setHistory((h) => [...h.slice(-(ROLLING_WINDOW - 1)), reading]);
    } else if (ev.type === "alert") {
      setAlerts((a) => [ev.data as Alert, ...a].slice(0, 200));
    }
  }, []);

  const conn = useWebSocket(onEvent);

  const acknowledge = useCallback((id: number) => {
    alertsApi
      .acknowledge(id)
      .then((r) => setAlerts((list) => list.map((a) => (a.id === id ? r.data : a))))
      .catch(() => undefined);
  }, []);

  const value = useMemo<DashboardState>(
    () => ({
      deviceId: devices.some((d) => d.device_id === deviceId) ? deviceId : deviceId,
      setDeviceId,
      devices,
      latest,
      history,
      alerts,
      conn,
      lastReadingAt: latest?.timestamp ?? null,
      acknowledge,
    }),
    [deviceId, devices, latest, history, alerts, conn, acknowledge]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard(): DashboardState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}
