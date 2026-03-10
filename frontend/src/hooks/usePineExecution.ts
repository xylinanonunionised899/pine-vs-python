import { useCallback, useRef, useState } from "react";
import type { CandlePoint, IndicatorSeries, TradeEvent } from "@shared/contracts";
import { executePineScript, type PineError, type PineExecutionResult } from "@/services/pineExecutionService";

export type PineExecutionState = {
  isRunning: boolean;
  indicators: IndicatorSeries[];
  trades: TradeEvent[];
  errors: PineError[];
  lastRunAt: string | null;
};

export function usePineExecution() {
  const [state, setState] = useState<PineExecutionState>({
    isRunning: false,
    indicators: [],
    trades: [],
    errors: [],
    lastRunAt: null,
  });

  // Execution counter to handle stale closures (per RESEARCH pitfall #6)
  const executionIdRef = useRef(0);

  const runPine = useCallback(async (sourceCode: string, candles: CandlePoint[], warmupBars?: number) => {
    const currentExecId = ++executionIdRef.current;

    setState((prev) => ({ ...prev, isRunning: true, errors: [] }));

    try {
      const result: PineExecutionResult = await executePineScript(sourceCode, candles, warmupBars);

      // Only apply results if this is still the latest execution (prevent stale closure)
      if (currentExecId !== executionIdRef.current) return;

      setState({
        isRunning: false,
        indicators: result.indicators,
        trades: result.trades,
        errors: result.errors,
        lastRunAt: new Date().toISOString(),
      });
    } catch (err) {
      if (currentExecId !== executionIdRef.current) return;
      setState((prev) => ({
        ...prev,
        isRunning: false,
        errors: [{ message: err instanceof Error ? err.message : String(err), line: 1, column: 1 }],
      }));
    }
  }, []);

  const clearResults = useCallback(() => {
    setState({
      isRunning: false,
      indicators: [],
      trades: [],
      errors: [],
      lastRunAt: null,
    });
  }, []);

  return { ...state, runPine, clearResults };
}
