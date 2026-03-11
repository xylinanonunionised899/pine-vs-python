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

/**
 * PineTS does not support strategy() — only indicator().
 * Auto-convert strategy scripts to indicator scripts by:
 * 1. Replacing strategy(...) declaration with indicator(...)
 * 2. Removing strategy.entry/exit/close/order/cancel lines
 * 3. Preserving all indicator logic (plots, ta.* calls, conditions)
 */
function convertStrategyToIndicator(source: string): { code: string; wasStrategy: boolean } {
  const wasStrategy = /strategy\s*\(/.test(source);
  if (!wasStrategy) return { code: source, wasStrategy: false };

  let code = source;
  // Replace strategy() declaration with indicator()
  code = code.replace(/strategy\s*\(/, "indicator(");
  // Remove strategy.entry/exit/close/order/cancel_all lines and their parent if-block if it becomes empty
  code = code.replace(/^\s*strategy\.(entry|exit|close|close_all|order|cancel|cancel_all)\s*\(.*\)\s*$/gm, "");
  // Remove if-blocks that now have empty bodies (Pine Script requires non-empty blocks)
  // Pattern: "if condition\n" followed only by blank lines until next non-indented line or EOF
  code = code.replace(/^\s*if\s+.+\n(\s*\n)*(?=\S|$)/gm, "");
  // Clean up multiple blank lines
  code = code.replace(/\n{3,}/g, "\n\n");
  return { code, wasStrategy: true };
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
  const { code: runnableCode, wasStrategy } = convertStrategyToIndicator(sourceCode);

  try {
    const pineTS = new PineTS(pineTSCandles);
    const { result, plots } = await pineTS.run(runnableCode);

    // Log raw output for debugging (PineTS output shape needs validation per RESEARCH open questions)
    console.log("[PineTS] Raw plots:", JSON.stringify(plots, null, 2).slice(0, 500));
    console.log("[PineTS] Raw result:", JSON.stringify(result, null, 2).slice(0, 500));

    const indicators = mapPlotsToIndicatorSeries(plots, candles, warmupBars);
    const trades = extractTradeEvents(result, plots, candles, sourceCode, wasStrategy);

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
  plots: Record<string, { data?: Array<{ time?: number; value?: number | null; options?: { color?: string } }> }>,
  candles: CandlePoint[],
  warmupBars: number,
): IndicatorSeries[] {
  if (!plots || typeof plots !== "object") return [];

  return Object.entries(plots)
    .filter(([, plot]) => Array.isArray(plot?.data) && plot.data.length > 0)
    .map(([name, plot], plotIndex) => {
      // PineTS uses #0, #1, etc. as plot keys — derive a friendlier name
      const cleanName = name.startsWith("#") ? `plot_${plotIndex}` : name.replace(/#\d+$/, "").trim();
      const dataArray = plot.data!;

      // PineTS data format: { time (epoch ms), value (number|null|NaN), options: { color } }
      const values: IndicatorPoint[] = dataArray.map((point, index) => {
        const v = point?.value;
        return {
          timestamp: candles[index]?.timestamp ?? new Date(point.time ?? 0).toISOString(),
          value: (v !== null && v !== undefined && !Number.isNaN(v)) ? v : null,
        };
      });

      // Extract color from first non-null point's options
      const firstColored = dataArray.find((p) => p.options?.color);
      const color = firstColored?.options?.color ?? "#f4b942";

      // Detect pane: if name contains RSI, MACD, Stoch, histogram -> "sub", else "main"
      const oscillatorPatterns = /rsi|macd|stoch|histogram|momentum|cci|atr|adx|willr|mfi/i;
      const pane = oscillatorPatterns.test(cleanName) ? "sub" : "main";

      return {
        name: cleanName,
        pane,
        style: { color },
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
  wasStrategy: boolean = false,
): TradeEvent[] {
  // Only extract trades if the original script was a strategy
  if (!wasStrategy && !/strategy\s*\(/.test(sourceCode)) return [];

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
