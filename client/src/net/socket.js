/**
 * Cienka warstwa nad WebSocket: automatyczne ponowne łączenie
 * z wykładniczym opóźnieniem. Niezależna od Reacta.
 */
export function createSocket({ url, onMessage, onStatus }) {
  let ws = null;
  let attempt = 0;
  let timer = null;
  let closedByUs = false;

  function connect() {
    onStatus('connecting');
    ws = new WebSocket(url);
    ws.onopen = () => {
      attempt = 0;
      onStatus('open');
    };
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      onMessage(msg);
    };
    ws.onclose = () => {
      if (closedByUs) return;
      onStatus('closed');
      timer = setTimeout(connect, Math.min(5000, 400 * 2 ** attempt++));
    };
  }

  connect();

  return {
    send(payload) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(payload));
      return true;
    },
    close() {
      closedByUs = true;
      clearTimeout(timer);
      ws?.close();
    },
  };
}

export function socketUrl() {
  const override = import.meta.env.VITE_WS_URL;
  if (override) return override;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}
