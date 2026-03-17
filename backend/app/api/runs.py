from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.contracts import RunConfig, StrategyArtifact
from app.services.run_service import run_service

router = APIRouter(prefix="/runs", tags=["runs"])


class ReplayRunRequest(BaseModel):
    dataset_id: str
    run_config: RunConfig
    python_artifact: StrategyArtifact
    pine_artifact: StrategyArtifact | None = None
    bridge_artifact_id: str | None = None


@router.get("")
def list_runs():
    return run_service.list_runs()


@router.get("/{run_id}")
def get_run(run_id: str):
    try:
        return run_service.get_run(run_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/replay")
def create_replay_run(payload: ReplayRunRequest):
    try:
        return run_service.create_replay_run(
            run_config=payload.run_config,
            python_artifact=payload.python_artifact,
            pine_artifact=payload.pine_artifact,
            dataset_id=payload.dataset_id,
            bridge_artifact_id=payload.bridge_artifact_id,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TimeoutError as e:
        raise HTTPException(status_code=408, detail=str(e))


@router.post("/live")
def create_live_run(payload: ReplayRunRequest):
    try:
        return run_service.create_live_run(
            run_config=payload.run_config,
            python_artifact=payload.python_artifact,
            pine_artifact=payload.pine_artifact,
            dataset_id=payload.dataset_id,
            bridge_artifact_id=payload.bridge_artifact_id,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TimeoutError as e:
        raise HTTPException(status_code=408, detail=str(e))


@router.post("/{run_id}/stop")
def stop_live_run(run_id: str):
    try:
        return run_service.stop_live_run(run_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
