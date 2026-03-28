import { useEffect, useRef, useCallback, useState } from 'react';
import { getAccessToken } from '../services/api';

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error';

interface UseGameSocketOptions {
  onMessage: (data: Record<string, unknown>) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export function useGameSocket(path: string | null, opts: UseGameSocketOptions) {
  const ws = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WsStatus>('closed');
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!path) return;

    const token = getAccessToken();
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}${path}?token=${encodeURIComponent(token)}`;

    setStatus('connecting');
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => {
      setStatus('open');
      optsRef.current.onOpen?.();
    };

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        optsRef.current.onMessage(data);
      } catch {
        // ignore malformed frames
      }
    };

    socket.onclose = () => {
      setStatus('closed');
      optsRef.current.onClose?.();
    };

    socket.onerror = () => {
      setStatus('error');
    };

    return () => {
      socket.close();
      ws.current = null;
    };
  }, [path]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, status };
}
