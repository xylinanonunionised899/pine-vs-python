import { PineTS } from "pinets";
import type { CandlePoint, IndicatorSeries, IndicatorPoint, TradeEvent } from "@shared/contracts";
import { toPineTSCandles } from "@/lib/pineDataAdapter";

export interface PineError {
  message: string;
  line: number;
  column: number;
}

export interface PineExecutionResult {
  indicators: IndicatorSeries[];
  trades: TradeEvent[];
  errors: PineError[];
  rawPlots: Record<string, unknown>;
  rawResult: Record<string, unknown>;
}

export async function executePineScript(
  sourceCode: string,
  candles: CandlePoint[],
  warmupBars: number = 100,
): Promise<PineExecutionResult> {
  if (candles.length === 0) {
    return {
      indicators: [],
      trades: [],
      errors: [{ message: "No candle data provided", line: 1, column: 1 }],
      rawPlots: {},
      rawResult: {},
    };
  }

  const pineTSCandles = toPineTSCandles(candles);

  try {
    const pineTS = new PineTS(pineTSCandles);
    const { result, plots } = await pineTS.run(sourceCode);

    // Log raw output for debugging (PineTS output shape needs validation per RESEARCH open questions)
    console.log("[PineTS] Raw plots:", JSON.stringify(plots, null, 2).slice(0, 500));
    console.log("[PineTS] Raw result:", JSON.stringify(result, null, 2).slice(0, 500));

    const indicators = mapPlotsToIndicatorSeries(plots, candles, warmupBars);
    const trades = extractTradeEvents(result, plots, candles, sourceCode);

    return {
      indicators,
      trades,
      errors: [],
      rawPlots: plots as Record<string, unknown>,
      rawResult: result as Record<string, unknown>,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const parsed = parsePineError(error);
    return { indicators: [], trades: [], errors: [parsed], rawPlots: {}, rawResult: {} };
  }
}

function mapPlotsToIndicatorSeries(
  plots: Record<string, { data?: Array<{ value?: number }> }>,
  candles: CandlePoint[],
  warmupBars: number,
): IndicatorSeries[] {
  if (!plots || typeof plots !== "object") return [];

  return Object.entries(plots).map(([name, plot]) => {
    // Handle PineTS #N disambiguation suffixes in plot titles
    const cleanName = name.replace(/#\d+$/, "").trim();
    const dataArray = Array.isArray(plot?.data) ? plot.data : [];

    const values: IndicatorPoint[] = dataArray.map((point, index) => ({
      timestamp: candles[index]?.timestamp ?? new Date().toISOString(),
      value: typeof point === "number" ? point : (point?.value ?? null),
    }));

    // Detect pane: if name contains RSI, MACD, Stoch, histogram -> "sub", else "main"
    const oscillatorPatterns = /rsi|macd|stoch|histogram|momentum|cci|atr|adx|willr|mfi/i;
    const pane = oscillatorPatterns.test(cleanName) ? "sub" : "main";

    return {
      name: cleanName,
      pane,
      style: { color: "#f4b942" },
      warmup_bars: warmupBars,
      values,
    };
  });
}

function extractTradeEvents(
  result: Record<string, unknown>,
  _plots: Record<string, unknown>,
  candles: CandlePoint[],
  sourceCode: string,
): TradeEvent[] {
  // Approach 1: Check if PineTS provides structured trade events directly
  if (result && typeof result === "object") {
    const strategyKeys = Object.keys(result).filter(
      (k) => k.includes("strategy") || k.includes("trade") || k.includes("entry") || k.includes("exit"),
    );
    if (strategyKeys.length > 0) {
      console.log("[PineTS] Found strategy keys in result:", strategyKeys);
    }
  }

  // Approach 2: Fallback -- derive trade events from boolean signals in result
  const isStrategy = /strategy\s*\(/.test(sourceCode);
  if (!isStrategy) return [];

  // Look for boolean condition variables in result
  const trades: TradeEvent[] = [];
  const conditionKeys = Object.keys(result ?? {}).filter((k) =>
    /condition|signal|long|short|buy|sell|entry|exit/i.test(k),
  );

  if (conditionKeys.length > 0) {
    const longKey = conditionKeys.find((k) => /long|buy|entry/i.test(k) && !/exit|short|sell/i.test(k));
    if (longKey && Array.isArray(result[longKey])) {
      const signals = result[longKey] as boolean[];
      let inLong = false;
      signals.forEach((isLong, index) => {
        if (isLong && !inLong && candles[index]) {
          trades.push({
            timestamp: candles[index].timestamp,
            side: "long_entry",
            price: candles[index].close,
            qty: 1,
            reason: longKey,
            source_engine: "pine",
          });
          inLong = true;
        } else if (!isLong && inLong && candles[index]) {
          trades.push({
            timestamp: candles[index].timestamp,
            side: "long_exit",
            price: candles[index].close,
            qty: 1,
            reason: longKey,
            source_engine: "pine",
          });
          inLong = false;
        }
      });
    }
  }

  return trades;
}

function parsePineError(error: Error): PineError {
  const message = error.message || String(error);
  // PineTS uses acorn parser -- errors typically include line info
  const lineMatch = message.match(/line\s*(\d+)/i);
  const colMatch = message.match(/col(?:umn)?\s*(\d+)/i);
  // Also check for acorn-style "X (Y:Z)" format
  const acornMatch = message.match(/\((\d+):(\d+)\)/);

  let line = 1;
  let column = 1;

  if (lineMatch) {
    line = parseInt(lineMatch[1], 10);
  } else if (acornMatch) {
    line = parseInt(acornMatch[1], 10);
    column = parseInt(acornMatch[2], 10);
  }
  if (colMatch) {
    column = parseInt(colMatch[1], 10);
  }

  return { message, line, column };
}
