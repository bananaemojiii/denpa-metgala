// Kalshi WebSocket v2 client — connects once, subscribes to market tickers,
// calls onTick on every price update. Reconnects with exponential backoff.

export interface KalshiTick {
  marketTicker: string;
  yesPrice: number; // 0–100 (cents)
  noPrice: number;
  volume: number;
  lastTrade: number;
  ts: number;
}

type TickHandler = (tick: KalshiTick) => void;

const WS_URL =
  process.env.NEXT_PUBLIC_KALSHI_WS_URL ??
  "wss://trading-api.kalshi.com/trade-api/ws/v2";

export class KalshiWS {
  private ws: WebSocket | null = null;
  private tickers: string[];
  private onTick: TickHandler;
  private retryDelay = 1000;
  private dead = false;
  private msgId = 1;

  constructor(tickers: string[], onTick: TickHandler) {
    this.tickers = tickers;
    this.onTick = onTick;
  }

  connect() {
    if (this.dead) return;
    const url = process.env.NEXT_PUBLIC_KALSHI_API_KEY
      ? `${WS_URL}?apiKey=${process.env.NEXT_PUBLIC_KALSHI_API_KEY}`
      : WS_URL;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.retryDelay = 1000;
      this.subscribe();
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        this.handleMessage(msg);
      } catch {
        // non-JSON frame — ignore
      }
    };

    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onerror = () => this.ws?.close();
  }

  private subscribe() {
    this.send({
      id: this.msgId++,
      cmd: "subscribe",
      params: { channels: ["ticker_v2"], market_tickers: this.tickers },
    });
  }

  private handleMessage(msg: Record<string, unknown>) {
    if (msg.type !== "ticker_v2") return;
    const d = msg as {
      market_ticker: string;
      yes_price: number;
      no_price: number;
      volume: number;
      last_price: number;
      ts: number;
    };
    this.onTick({
      marketTicker: d.market_ticker,
      yesPrice: d.yes_price,
      noPrice: d.no_price,
      volume: d.volume ?? 0,
      lastTrade: d.last_price ?? 0,
      ts: d.ts ?? Date.now(),
    });
  }

  private send(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private scheduleReconnect() {
    if (this.dead) return;
    setTimeout(() => this.connect(), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
  }

  destroy() {
    this.dead = true;
    this.ws?.close();
  }
}
