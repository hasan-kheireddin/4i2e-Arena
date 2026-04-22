import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken, getRefreshToken, refreshAccessToken } from '../services/api';

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';

export interface WsLatency {
  rttMs: number | null;
  clockOffsetMs: number | null;
}

interface UseGameSocketOptions {
  onMessage: (data: Record<string, unknown>) => void;
  onOpen?: () => void;
  onClose?: (event?: CloseEvent) => void;
  autoReconnect?: boolean;
  enableLatencyProbe?: boolean;
  onLatencyUpdate?: (latency: WsLatency) => void;
}

const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 5000;
const LATENCY_PROBE_INTERVAL_MS = 5000;
const TOKEN_REFRESH_SKEW_SECONDS = 15;

function parseJwtExp(token: string): number | null {
  const payloadPart = token.split('.')[1];
  if (!payloadPart) return null;

  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(window.atob(padded)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function tokenNeedsRefresh(token: string | null, forceRefresh: boolean): boolean {
  if (forceRefresh || !token) return true;
  const exp = parseJwtExp(token);
  if (exp === null) return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp <= nowSeconds + TOKEN_REFRESH_SKEW_SECONDS;
}

function getSocketBaseUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (typeof configured === 'string') {
    const trimmed = configured.trim();
    if (trimmed) {
      if (/^wss?:\/\//i.test(trimmed)) return trimmed;
      if (/^https?:\/\//i.test(trimmed)) {
        const httpUrl = new URL(trimmed);
        httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        return httpUrl.toString();
      }
      if (trimmed.startsWith('/')) {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        return `${protocol}://${window.location.host}${trimmed}`;
      }
      return `ws://${trimmed}`;
    }
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}`;
}

export function useGameSocket(path: string | null, opts: UseGameSocketOptions) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const latencyProbeTimer = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const closedIntentionally = useRef(false);
  const optsRef = useRef(opts);
  const latencyRef = useRef<WsLatency>({ rttMs: null, clockOffsetMs: null });
  const [status, setStatus] = useState<WsStatus>('closed');
  const [latency, setLatency] = useState<WsLatency>({ rttMs: null, clockOffsetMs: null });

  optsRef.current = opts;

  useEffect(() => {
    if (!path) {
      setStatus('closed');
      setLatency({ rttMs: null, clockOffsetMs: null });
      latencyRef.current = { rttMs: null, clockOffsetMs: null };
      return;
    }

    let cancelled = false;
    closedIntentionally.current = false;
    reconnectAttempts.current = 0;

    const clearReconnectTimer = () => {
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    const clearLatencyProbeTimer = () => {
      if (latencyProbeTimer.current !== null) {
        window.clearInterval(latencyProbeTimer.current);
        latencyProbeTimer.current = null;
      }
    };

    const updateLatency = (next: WsLatency) => {
      latencyRef.current = next;
      setLatency(next);
      optsRef.current.onLatencyUpdate?.(next);
    };

    const resetLatency = () => {
      updateLatency({ rttMs: null, clockOffsetMs: null });
    };

    const closeSocket = () => {
      if (ws.current) {
        const current = ws.current;
        ws.current = null;
        current.close();
      }
    };

    const getSocketUrl = async (forceRefresh = false) => {
      let token = getAccessToken();
      if (tokenNeedsRefresh(token, forceRefresh)) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          token = getAccessToken();
        } else {
          token = getAccessToken();
          if (tokenNeedsRefresh(token, false)) return null;
        }
      }
      if (!token) return null;
      const url = new URL(path, getSocketBaseUrl());
      url.searchParams.set('token', token);
      return url.toString();
    };

    const sendLatencyProbe = (socket: WebSocket) => {
      if (!optsRef.current.enableLatencyProbe) return;
      if (ws.current !== socket || socket.readyState !== WebSocket.OPEN) return;
      const probe = {
        type: 'ping',
        client_ts_ms: Date.now(),
      };
      socket.send(JSON.stringify(probe));
    };

    const scheduleReconnect = (forceRefresh = false) => {
      if (cancelled || closedIntentionally.current || optsRef.current.autoReconnect === false) {
        setStatus('closed');
        return;
      }

      reconnectAttempts.current += 1;
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * (2 ** (reconnectAttempts.current - 1)),
        MAX_RECONNECT_DELAY_MS,
      );
      setStatus('reconnecting');
      clearReconnectTimer();
      reconnectTimer.current = window.setTimeout(() => {
        void connect(forceRefresh);
      }, delay);
    };

    const connect = async (forceRefresh = false) => {
      clearReconnectTimer();
      clearLatencyProbeTimer();
      closeSocket();
      setStatus(reconnectAttempts.current > 0 ? 'reconnecting' : 'connecting');

      const url = await getSocketUrl(forceRefresh);
      if (!url) {
        if (!getAccessToken() && !getRefreshToken()) {
          setStatus('closed');
          return;
        }
        scheduleReconnect(true);
        return;
      }
      if (cancelled || closedIntentionally.current) {
        setStatus('closed');
        return;
      }

      const socket = new WebSocket(url);
      let opened = false;
      ws.current = socket;

      socket.onopen = () => {
        if (cancelled || ws.current !== socket) return;
        opened = true;
        reconnectAttempts.current = 0;
        setStatus('open');
        optsRef.current.onOpen?.();
        if (optsRef.current.enableLatencyProbe) {
          sendLatencyProbe(socket);
          latencyProbeTimer.current = window.setInterval(() => {
            sendLatencyProbe(socket);
          }, LATENCY_PROBE_INTERVAL_MS);
        }
      };

      socket.onmessage = (event) => {
        if (cancelled || ws.current !== socket) return;
        try {
          const data = JSON.parse(event.data);
          if (optsRef.current.enableLatencyProbe && data.type === 'pong') {
            const echoedClientTs = Number(data.client_ts_ms);
            if (Number.isFinite(echoedClientTs)) {
              const now = Date.now();
              const sampleRtt = Math.max(0, now - echoedClientTs);
              const prev = latencyRef.current;
              const smoothedRtt = prev.rttMs === null
                ? sampleRtt
                : prev.rttMs * 0.7 + sampleRtt * 0.3;

              let nextClockOffset = prev.clockOffsetMs;
              const serverTsMs = Number(data.server_ts_ms);
              if (Number.isFinite(serverTsMs)) {
                const sampleOffset = serverTsMs - (echoedClientTs + sampleRtt / 2);
                nextClockOffset = prev.clockOffsetMs === null
                  ? sampleOffset
                  : prev.clockOffsetMs * 0.7 + sampleOffset * 0.3;
              }

              updateLatency({
                rttMs: smoothedRtt,
                clockOffsetMs: nextClockOffset,
              });
            }
            return;
          }
          optsRef.current.onMessage(data);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onerror = () => {
        if (cancelled || ws.current !== socket) return;
        setStatus('error');
      };

      socket.onclose = (event) => {
        if (ws.current === socket) {
          ws.current = null;
        }
        clearLatencyProbeTimer();
        optsRef.current.onClose?.(event);
        if (cancelled || closedIntentionally.current) {
          setStatus('closed');
          return;
        }
        scheduleReconnect(event.code === 4401 || !opened);
      };
    };

    void connect();

    return () => {
      cancelled = true;
      closedIntentionally.current = true;
      clearReconnectTimer();
      clearLatencyProbeTimer();
      closeSocket();
      setStatus('closed');
      resetLatency();
    };
  }, [path]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, status, latency };
}
