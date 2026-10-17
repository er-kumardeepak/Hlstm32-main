import { useEffect, useRef, useState } from "react";
import type { WsEvent } from "../types";
import { wsApi } from "../services/api";

export type ConnState = "connecting" | "live" | "offline";

/**
 * Subscribes to live events on the shared WebSocket (queries piggyback on the
 * same connection). Reconnect/backoff lives in the WsApi singleton.
 */
export function useWebSocket(onEvent: (ev: WsEvent) => void): ConnState {
  const [state, setState] = useState<ConnState>(wsApi.connState);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    wsApi.connect();
    const unsubState = wsApi.onState(setState);
    const unsubEvent = wsApi.onEvent((ev) => handlerRef.current(ev));
    return () => {
      unsubState();
      unsubEvent();
    };
  }, []);

  return state;
}
