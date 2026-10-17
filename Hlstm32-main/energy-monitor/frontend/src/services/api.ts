import type { AggregateBucket, Alert, Device, Health, Reading, WsEvent } from "../types";

/**
 * WebSocket-only client (the backend has no REST API any more).
 *
 * One shared connection to /ws/dashboard carries:
 *  - live push events ("reading", "alert") for the dashboard
 *  - request/response queries via {type, request_id, params} frames
 *    answered with {type: "<x>_result", request_id, data} or
 *    {type: "error", request_id, detail}
 */

const WS_BASE = (import.meta.env.VITE_WS_URL ?? "ws://localhost:8000").replace(/\/+$/, "");

export const DASHBOARD_WS_URL = `${WS_BASE}/ws/dashboard`;
export const DEVICE_WS_URL = `${WS_BASE}/ws/device`;

export type ConnState = "connecting" | "live" | "offline";

type Pending = {
  resolve: (value: { data: unknown }) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

type LiveFrame = { type?: string; request_id?: number; data?: unknown; detail?: string };

class WsApi {
  private ws: WebSocket | null = null;
  private reqId = 1;
  private attempt = 0;
  private closed = false;
  private pending = new Map<number, Pending>();
  private eventListeners = new Set<(ev: WsEvent) => void>();
  private stateListeners = new Set<(s: ConnState) => void>();
  private state: ConnState = "connecting";

  connect(): void {
    if (this.ws || this.closed) return;
    this.setState("connecting");
    try {
      this.ws = new WebSocket(DASHBOARD_WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.attempt = 0;
      this.setState("live");
      // Requests made while offline are rejected, so nothing to replay here.
    };
    this.ws.onmessage = (e) => {
      let msg: LiveFrame;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }
      if (msg.request_id !== undefined && this.pending.has(msg.request_id)) {
        const p = this.pending.get(msg.request_id)!;
        this.pending.delete(msg.request_id);
        clearTimeout(p.timer);
        if (msg.type === "error") p.reject(new Error(msg.detail ?? "query failed"));
        else p.resolve({ data: msg.data });
        return;
      }
      for (const cb of this.eventListeners) cb({ type: (msg.type ?? "") as "reading", data: msg.data as Reading });
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (!this.closed) this.scheduleReconnect();
    };
    this.ws.onerror = () => this.ws?.close();
  }

  private setState(s: ConnState) {
    if (s === this.state) return;
    this.state = s;
    for (const cb of this.stateListeners) cb(s);
  }

  get connState(): ConnState {
    return this.state;
  }

  // The shared client lives for the app's lifetime, so no timer cleanup is
  // needed; `connect()` guards against double sockets after close().
  private scheduleReconnect() {
    this.setState("offline");
    const delay = Math.min(1000 * 2 ** this.attempt, 10000);
    this.attempt += 1;
    setTimeout(() => this.connect(), delay);
  }

  onEvent(cb: (ev: WsEvent) => void): () => void {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  onState(cb: (s: ConnState) => void): () => void {
    cb(this.state);
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  request<T>(
    type: string,
    params: Record<string, unknown> = {},
    timeoutMs = 8000,
  ): Promise<{ data: T }> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`WebSocket offline (${type})`));
        return;
      }
      const request_id = this.reqId++;
      const timer = setTimeout(() => {
        this.pending.delete(request_id);
        reject(new Error(`${type} timed out`));
      }, timeoutMs);
      this.pending.set(request_id, { resolve: resolve as (v: { data: unknown }) => void, reject, timer });
      try {
        this.ws.send(JSON.stringify({ type, request_id, params }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(request_id);
        reject(err);
      }
    });
  }
}

export const wsApi = new WsApi();

// ---------------------------------------------------------------------------
// Query surface — unchanged signatures from the old axios client (same
// `Promise<{ data: T }>` shape), just served over the WebSocket.
// ---------------------------------------------------------------------------

export const healthApi = {
  get: () => wsApi.request<Health>("health"),
};

export const readingsApi = {
  latest: (deviceId?: string) =>
    wsApi.request<Reading>("latest", deviceId ? { device_id: deviceId } : {}),
  history: (params: { device_id?: string; from?: string; to?: string; limit?: number }) =>
    wsApi.request<Reading[]>("history", params),
  aggregate: (params: { interval: string; minutes: number; device_id?: string }) =>
    wsApi.request<AggregateBucket[]>("aggregate", params),
};

export const devicesApi = {
  list: (status?: string) => wsApi.request<Device[]>("devices", status ? { status } : {}),
  get: (deviceId: string) => wsApi.request<Device>("device", { device_id: deviceId }),
};

export const alertsApi = {
  list: (params: { device_id?: string; severity?: string; acknowledged?: boolean; limit?: number }) =>
    wsApi.request<Alert[]>("alerts", params),
  acknowledge: (alertId: number) => wsApi.request<Alert>("acknowledge", { alert_id: alertId, acknowledged: true }),
};

export { DEVICE_WS_URL as deviceWsUrl };
