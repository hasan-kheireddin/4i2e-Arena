import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken, refreshAccessToken } from '../services/api';

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';

interface UseGameSocketOptions {
  onMessage: (data: Record<string, unknown>) => void;
  onOpen?: () => void;
  onClose?: (event?: CloseEvent) => void;
  autoReconnect?: boolean;
}

const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 5000;

export function useGameSocket(path: string | null, opts: UseGameSocketOptions) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const closedIntentionally = useRef(false);
  const optsRef = useRef(opts);
  const [status, setStatus] = useState<WsStatus>('closed');

  optsRef.current = opts;

  useEffect(() => {
    if (!path) {
      setStatus('closed');
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

    const closeSocket = () => {
      if (ws.current) {
        const current = ws.current;
        ws.current = null;
        current.close();
      }
    };

    const getSocketUrl = async (forceRefresh = false) => {
      let token = getAccessToken();
      if ((!token || forceRefresh) && !(await refreshAccessToken())) {
        return null;
      }
      token = getAccessToken();
      if (!token) return null;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${protocol}://${window.location.host}${path}?token=${encodeURIComponent(token)}`;
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
      closeSocket();
      setStatus(reconnectAttempts.current > 0 ? 'reconnecting' : 'connecting');

      const url = await getSocketUrl(forceRefresh);
      if (!url) {
        setStatus('closed');
        return;
      }
      if (cancelled || closedIntentionally.current) {
        setStatus('closed');
        return;
      }

      const socket = new WebSocket(url);
      ws.current = socket;

      socket.onopen = () => {
        if (cancelled || ws.current !== socket) return;
        reconnectAttempts.current = 0;
        setStatus('open');
        optsRef.current.onOpen?.();
      };

      socket.onmessage = (event) => {
        if (cancelled || ws.current !== socket) return;
        try {
          const data = JSON.parse(event.data);
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
        optsRef.current.onClose?.(event);
        if (cancelled || closedIntentionally.current) {
          setStatus('closed');
          return;
        }
        scheduleReconnect(event.code === 4401);
      };
    };

    void connect();

    return () => {
      cancelled = true;
      closedIntentionally.current = true;
      clearReconnectTimer();
      closeSocket();
      setStatus('closed');
    };
  }, [path]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, status };
}
