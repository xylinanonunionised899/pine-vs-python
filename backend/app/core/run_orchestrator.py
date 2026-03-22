from __future__ import annotations

from uuid import uuid4

from app.core.comparison_engine import ComparisonEngine
from app.core.pine_bridge_engine import PineBridgeEngine
from app.core.pine_local_engine import PineLocalEngine
from app.core.python_engine import PythonStrategyEngine
from app.models.contracts import ComparisonResult, RunConfig, StrategyArtifact, StrategyLanguage


class RunOrchestrator:
    def __init__(self) -> None:
        self.comparison_engine = ComparisonEngine()
        self.python_engine = PythonStrategyEngine()
        self.pine_local_engine = PineLocalEngine()
        self.pine_bridge_engine = PineBridgeEngine()

    def create_run(
        self,
        run_config: RunConfig,
        pine_artifact: StrategyArtifact,
        python_artifact: StrategyArtifact,
    ) -> dict[str, str]:
        assert pine_artifact.language == StrategyLanguage.PINE
        assert python_artifact.language == StrategyLanguage.PYTHON
        return {
            "run_id": str(uuid4()),
            "mode": run_config.mode.value,
            "status": "queued",
        }

    def preview_comparison(self, run_config: RunConfig) -> ComparisonResult:
        _ = run_config
        pine_preview = self.python_engine.run_preview()
        python_preview = self.python_engine.run_preview()
        return self.comparison_engine.compare_series(
            pine_preview["series"],
            python_preview["series"],
            tolerance=run_config.tolerance,
        )
