import type { CandlePoint } from "@shared/contracts";

// PineTS expects: { openTime: number (epoch ms), open, high, low, close, volume }
export interface PineTSCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function toPineTSCandles(candles: CandlePoint[]): PineTSCandle[] {
  return candles.map((candle) => ({
    openTime: new Date(candle.timestamp).getTime(),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume ?? 0),
  }));
}
