import { useEffect, useMemo, useRef } from "react";
import { CandlestickSeries, ColorType, LineSeries, createChart, createSeriesMarkers, type SeriesMarker, type Time } from "lightweight-charts";

import type { CandlePoint, IndicatorSeries, TradeEvent } from "@shared/contracts";

type ChartPanelProps = {
  title: string;
  seriesName: string;
  tone: "pine" | "python";
  candles: CandlePoint[];
  indicatorSeries: IndicatorSeries[];
  trades?: TradeEvent[];
  emptyMessage: string;
};

type SeriesBucket = {
  overlaySeries: IndicatorSeries[];
  subPaneSeries: IndicatorSeries[];
};

const toChartTime = (timestamp: string): Time => Math.floor(new Date(timestamp).getTime() / 1000) as Time;

function getSeriesValues(series: IndicatorSeries): number[] {
  return series.values
    .map((item) => item.value)
    .filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(value));
}

function minMax(arr: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

function isPriceLikeSeries(series: IndicatorSeries, candles: CandlePoint[]): boolean {
  const candlePrices = candles.flatMap((candle) => [candle.open, candle.high, candle.low, candle.close]);
  const values = getSeriesValues(series);
  if (candlePrices.length === 0 || values.length === 0) {
    return false;
  }
  const [candleMin, candleMax] = minMax(candlePrices);
  const [seriesMin, seriesMax] = minMax(values);
  const seriesMid = (seriesMin + seriesMax) / 2;
  const candleSpan = Math.max(candleMax - candleMin, 1);

  if (seriesMax <= 1.5 && seriesMin >= -1.5) {
    return false;
  }

  return (
    seriesMid >= candleMin - candleSpan * 0.5 &&
    seriesMid <= candleMax + candleSpan * 0.5 &&
    seriesMax >= candleMin - candleSpan &&
    seriesMin <= candleMax + candleSpan
  );
}

function splitSeries(indicatorSeries: IndicatorSeries[], candles: CandlePoint[]): SeriesBucket {
  const overlaySeries = indicatorSeries.filter((series) => series.pane !== "sub" && isPriceLikeSeries(series, candles));
  const subPaneSeries = indicatorSeries.filter((series) => series.pane === "sub" || !isPriceLikeSeries(series, candles));
  return { overlaySeries, subPaneSeries };
}

function tradesToMarkers(trades: TradeEvent[]): SeriesMarker<Time>[] {
  if (trades.length === 0) return [];

  const markers: SeriesMarker<Time>[] = trades.map((trade) => {
    const time = toChartTime(trade.timestamp);
    const text = trade.side.replace(/_/g, " ");

    switch (trade.side) {
      case "long_entry":
        return { time, position: "belowBar" as const, shape: "arrowUp" as const, color: "#20c997", text };
      case "long_exit":
        return { time, position: "aboveBar" as const, shape: "arrowDown" as const, color: "#ff6b6b", text };
      case "short_entry":
        return { time, position: "belowBar" as const, shape: "arrowDown" as const, color: "#ff6b6b", text };
      case "short_exit":
        return { time, position: "aboveBar" as const, shape: "arrowUp" as const, color: "#20c997", text };
    }
  });

  // CRITICAL: createSeriesMarkers requires markers sorted by time ascending
  markers.sort((a, b) => (a.time as number) - (b.time as number));

  return markers;
}

export function ChartPanel({ title, seriesName, tone, candles, indicatorSeries, trades, emptyMessage }: ChartPanelProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const { overlaySeries, subPaneSeries } = useMemo(() => splitSeries(indicatorSeries, candles), [indicatorSeries, candles]);

  const chartHeight = subPaneSeries.length > 0 ? 420 : 300;

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) {
      return;
    }

    const chart = createChart(chartRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0b1220" }, textColor: "#d7e1f3" },
      grid: {
        vertLines: { color: "rgba(150, 180, 220, 0.08)" },
        horzLines: { color: "rgba(150, 180, 220, 0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(150, 180, 220, 0.12)" },
      timeScale: { borderColor: "rgba(150, 180, 220, 0.12)", timeVisible: true, secondsVisible: false },
      width: chartRef.current.clientWidth,
      height: chartHeight,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#20c997",
      downColor: "#ff6b6b",
      wickUpColor: "#20c997",
      wickDownColor: "#ff6b6b",
      borderVisible: false,
      priceLineVisible: false,
    });
    candleSeries.setData(
      candles.map((candle) => ({
        time: toChartTime(candle.timestamp),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );

    // Overlay indicators on main pane (pane 0)
    overlaySeries.forEach((series, index) => {
      const lineSeries = chart.addSeries(LineSeries, {
        color: (series.style.color as string | undefined) ?? (index === 0 ? (tone === "pine" ? "#f4b942" : "#58a6ff") : "#9bdb4d"),
        lineWidth: index === 0 ? 3 : 2,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      });
      lineSeries.setData(
        series.values
          .filter((item) => item.value !== null && item.value !== undefined && !Number.isNaN(item.value))
          .map((item) => ({ time: toChartTime(item.timestamp), value: item.value as number })),
      );
    });

    // Sub-pane indicators (oscillators like RSI, MACD, Stoch) on pane 1
    subPaneSeries.forEach((series) => {
      const line = chart.addSeries(LineSeries, {
        color: (series.style.color as string) ?? "#f4b942",
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      }, 1); // paneIndex = 1
      line.setData(
        series.values
          .filter((item) => item.value !== null && item.value !== undefined && !Number.isNaN(item.value))
          .map((item) => ({ time: toChartTime(item.timestamp), value: item.value as number })),
      );
    });

    // Set sub-pane height if any sub-pane series were added
    const subPane = chart.panes()[1];
    if (subPane) subPane.setHeight(120);

    // Trade markers as buy/sell arrows on the candlestick chart
    const tradeMarkers = tradesToMarkers(trades ?? []);
    if (tradeMarkers.length > 0) {
      createSeriesMarkers(candleSeries, tradeMarkers);
    }

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current) {
        chart.applyOptions({ width: chartRef.current.clientWidth });
      }
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles, overlaySeries, subPaneSeries, trades, tone, chartHeight]);

  return (
    <section className="chart-shell">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Synchronized chart</p>
          <h3>{title}</h3>
        </div>
        <span className="chart-label">{seriesName}</span>
      </div>
      {candles.length === 0 ? <div className="empty-state">{emptyMessage}</div> : <div ref={chartRef} className="chart-canvas" />}
      {candles.length > 0 ? (
        <div className="summary-box">
          <p>{overlaySeries.length > 0 ? `Overlay indicators: ${overlaySeries.map((series) => series.name).join(", ")}` : "No price-like indicator series to overlay yet."}</p>
          {subPaneSeries.length > 0 ? <p>Sub-pane indicators: {subPaneSeries.map((series) => series.name).join(", ")}</p> : null}
          {trades && trades.length > 0 ? <p>Trade markers: {trades.length} events</p> : null}
        </div>
      ) : null}
    </section>
  );
}
