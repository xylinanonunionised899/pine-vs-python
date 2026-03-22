from __future__ import annotations

from fastapi import APIRouter

from app.models.contracts import ChatRequest
from app.services.chat_service import chat_service
from app.services.ollama_client import OllamaClient

router = APIRouter(prefix="/chat", tags=["chat"])
client = OllamaClient()


@router.get("/health")
def chat_health() -> dict[str, object]:
    from app.services.llm_gateway import llm_gateway
    health = client.healthcheck()
    health["llm_busy"] = llm_gateway.is_busy
    health["llm_queue_depth"] = llm_gateway.queue_depth
    return health


@router.get("/models")
async def chat_models():
    return await client.list_models()


@router.post("")
async def chat(request: ChatRequest):
    return await chat_service.respond(request)
