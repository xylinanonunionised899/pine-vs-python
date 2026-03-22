from __future__ import annotations

import pytest

from app.models.contracts import ChatErrorClass, ChatRequest, ChatResponse, ChatStatus
from app.services.chat_service import ChatService
from app.services.ollama_client import OllamaChatError, OllamaChatResult, is_chat_capable_model, sanitize_ollama_text


def make_request(model: str = "qwen3.5-9b-claude:latest") -> ChatRequest:
    return ChatRequest(
        model=model,
        intent="analysis",
        messages=[{"role": "user", "content": "Explain the latest mismatch."}],
        include_targets=["pine_code", "python_code", "run_artifacts"],
    )


def test_sanitize_ollama_text_removes_hidden_blocks_and_transcript_noise() -> None:
    raw = """
<think>internal</think>
assistant: The clean answer.
user: Repeat the question.
<analysis>hidden</analysis>
<|endoftext|>
"""
    cleaned, sanitized = sanitize_ollama_text(raw)

    assert cleaned == "The clean answer."
    assert sanitized is True


def test_embed_model_is_not_chat_capable() -> None:
    assert is_chat_capable_model("nomic-embed-text:latest") is False
    assert is_chat_capable_model("qwen3.5-9b-claude:latest") is True


@pytest.mark.asyncio
async def test_chat_service_returns_timeout_fallback(monkeypatch) -> None:
    service = ChatService()

    async def raise_timeout(_request: ChatRequest):
        raise OllamaChatError(ChatErrorClass.TIMEOUT, "The selected model timed out.")

    monkeypatch.setattr(service.ollama, "chat", raise_timeout)
    response = await service.respond(make_request())

    assert response.status == ChatStatus.FALLBACK
    assert response.error_class == ChatErrorClass.TIMEOUT
    assert response.fallback_used is True
    assert "timed out" in response.content.lower()


@pytest.mark.asyncio
async def test_chat_service_returns_success_response(monkeypatch) -> None:
    service = ChatService()

    async def fake_chat(_request: ChatRequest):
        return OllamaChatResult(
            response=ChatResponse(
                model="qwen3.5-9b-claude:latest",
                content="The app chat path works as expected.",
                status=ChatStatus.OK,
                fallback_used=False,
            ),
            sanitized=True,
        )

    monkeypatch.setattr(service.ollama, "chat", fake_chat)
    response = await service.respond(make_request())

    assert response.status == ChatStatus.OK
    assert response.content == "The app chat path works as expected."
    assert response.fallback_used is False
