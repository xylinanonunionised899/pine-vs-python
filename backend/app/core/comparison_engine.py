from __future__ import annotations

from math import isclose

from app.models.contracts import ComparisonResult, ComparisonSummary, DiffClassification, IndicatorSeries, MismatchDetail, RunMode, TradeEvent


class ComparisonEngine:
    def compare_series(
        self,
        pine_series: list[IndicatorSeries],
        python_series: list[IndicatorSeries],
        tolerance: float,
        run_mode: RunMode | None = None,
        dataset_id: str | None = None,
        live: bool = False,
        artifact_refs: list[str] | None = None,
    ) -> ComparisonResult:
        python_lookup = {series.name: series for series in python_series}
        series_mismatches: list[MismatchDetail] = []

        for pine in pine_series:
            peer = python_lookup.get(pine.name)
            if peer is None:
                if not pine.values:
                    continue
                series_mismatches.append(
                    MismatchDetail(
                        classification=DiffClassification.PYTHON_IMPLEMENTATION,
                        series_name=pine.name,
                        timestamp=pine.values[0].timestamp,
                        expected=None,
                        actual=None,
                        delta=None,
                        message="Python series is missing.",
                        suspected_region=f"python:{pine.name}",
                    )
                )
                continue
            limit = min(len(pine.values), len(peer.values))
            for index in range(limit):
                pine_point = pine.values[index]
                python_point = peer.values[index]
                pine_value = pine_point.value
                python_value = python_point.value
                if pine_value is None or python_value is None:
                    continue
                if isclose(pine_value, python_value, rel_tol=tolerance, abs_tol=tolerance):
                    continue
                series_mismatches.append(
                    MismatchDetail(
                        classification=DiffClassification.NUMERIC_TOLERANCE,
                        series_name=pine.name,
                        timestamp=pine_point.timestamp,
                        expected=pine_value,
                        actual=python_value,
                        delta=python_value - pine_value,
                        message="Indicator values diverged beyond tolerance.",
                        suspected_region=f"series:{pine.name}",
                    )
                )
                break

        trade_mismatches: list[MismatchDetail] = []
        summary = ComparisonSummary(
            aligned=not series_mismatches,
            total_series=len(pine_series),
            mismatched_series=len(series_mismatches),
            total_trade_events=0,
            mismatched_trade_events=0,
        )
        return ComparisonResult(
            summary=summary,
            series_mismatches=series_mismatches,
            trade_mismatches=trade_mismatches,
            first_mismatch=series_mismatches[0] if series_mismatches else None,
            suggested_next_action=self._suggest_next_action(series_mismatches),
            run_mode=run_mode,
            dataset_id=dataset_id,
            live=live,
            artifact_refs=artifact_refs or [],
        )

    def compare_trades(self, pine_trades: list[TradeEvent], python_trades: list[TradeEvent], tolerance: float) -> list[MismatchDetail]:
        mismatches: list[MismatchDetail] = []
        limit = min(len(pine_trades), len(python_trades))
        for index in range(limit):
            pine_trade = pine_trades[index]
            python_trade = python_trades[index]
            if pine_trade.side != python_trade.side:
                mismatches.append(MismatchDetail(classification=DiffClassification.PYTHON_IMPLEMENTATION, series_name="trade_events", timestamp=pine_trade.timestamp, expected=None, actual=None, delta=None, message="Trade side diverged.", suspected_region="trade_logic"))
                continue
            if not isclose(pine_trade.price, python_trade.price, rel_tol=tolerance, abs_tol=tolerance):
                mismatches.append(MismatchDetail(classification=DiffClassification.NUMERIC_TOLERANCE, series_name="trade_price", timestamp=pine_trade.timestamp, expected=pine_trade.price, actual=python_trade.price, delta=python_trade.price - pine_trade.price, message="Trade price diverged beyond tolerance.", suspected_region="execution_price"))
        return mismatches

    @staticmethod
    def _suggest_next_action(mismatches: list[MismatchDetail]) -> str | None:
        if not mismatches:
            return "No differences detected. Review the run artifacts and live updates."
        first = mismatches[0]
        if first.classification == DiffClassification.NUMERIC_TOLERANCE:
            return "Inspect warmup handling, smoothing seed, and timeframe aggregation."
        return "Inspect data alignment and strategy logic around the first mismatched bar."
