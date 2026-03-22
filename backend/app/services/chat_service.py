from __future__ import annotations

import logging
from time import perf_counter

from app.models.contracts import ChatErrorClass, ChatRequest, ChatResponse, ChatStatus, PermissionTarget
from app.services.ollama_client import OllamaChatError, OllamaClient
from app.services.permission_manager import permission_manager
from app.services.run_service import run_service

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self) -> None:
        self.ollama = OllamaClient()

    async def respond(self, request: ChatRequest) -> ChatResponse:
        started_at = perf_counter()
        sanitized = False
        fallback_used = False
        error_class: ChatErrorClass | None = None

        if request.model == "offline-fallback":
            fallback_used = True
            response = self._fallback_response(request, None)
            logger.info("ollama_chat model=%s duration_ms=%s fallback_used=%s error_class=%s sanitized=%s", request.model, int((perf_counter() - started_at) * 1000), fallback_used, response.error_class, sanitized)
            return response

        if request.intent == "apply_fix" and not permission_manager.is_allowed(PermissionTarget.PYTHON_CODE, "write"):
            response = ChatResponse(
                model=request.model,
                content="Write access is not active. Approve a write action before applying a patch.",
                requires_approval=True,
                proposed_patch="# approval required",
                status=ChatStatus.ERROR,
                error_class=ChatErrorClass.PERMISSION_REQUIRED,
                fallback_used=False,
            )
            logger.info("ollama_chat model=%s duration_ms=%s fallback_used=%s error_class=%s sanitized=%s", request.model, int((perf_counter() - started_at) * 1000), fallback_used, response.error_class, sanitized)
            return response

        try:
            from app.services.llm_gateway import llm_gateway
            async with llm_gateway.inference():
                result = await self.ollama.chat(request)
            sanitized = result.sanitized
            response = result.response
        except TimeoutError as exc:
            fallback_used = True
            error_class = ChatErrorClass.TIMEOUT
            response = self._fallback_response(
                request,
                OllamaChatError(ChatErrorClass.TIMEOUT, str(exc)),
            )
        except OllamaChatError as exc:
            fallback_used = True
            error_class = exc.error_class
            response = self._fallback_response(request, exc)
        except Exception:
            fallback_used = True
            error_class = ChatErrorClass.OLLAMA_UNREACHABLE
            response = self._fallback_response(
                request,
                OllamaChatError(ChatErrorClass.OLLAMA_UNREACHABLE, "Unexpected error while contacting Ollama."),
            )

        logger.info(
            "ollama_chat model=%s duration_ms=%s fallback_used=%s error_class=%s sanitized=%s",
            request.model,
            int((perf_counter() - started_at) * 1000),
            fallback_used,
            error_class,
            sanitized,
        )
        return response

    def _fallback_response(self, request: ChatRequest, error: OllamaChatError | None) -> ChatResponse:
        context = self._fallback_context(request.run_id)
        prompt = request.messages[-1].content if request.messages else ""
        if error is None:
            content = f"Offline fallback response. {context} Prompt: {prompt}".strip()
            return ChatResponse(
                model=request.model,
                content=content,
                requires_approval=request.intent == "apply_fix",
                proposed_patch="# offline fallback suggestion" if request.intent == "apply_fix" else None,
                status=ChatStatus.FALLBACK,
                fallback_used=True,
            )

        if error.error_class == ChatErrorClass.MODEL_MISSING:
            message = f"Selected model is not available locally. {error.detail} {context}"
        elif error.error_class == ChatErrorClass.TIMEOUT:
            message = f"Ollama is responding slowly. {error.detail} {context}"
        elif error.error_class == ChatErrorClass.CLEANED_RESPONSE_EMPTY:
            message = f"Ollama returned no usable plain-text answer. {context} Prompt: {prompt}"
        else:
            message = f"Ollama is not reachable from the app right now. {error.detail} {context}"

        return ChatResponse(
            model=request.model,
            content=message.strip(),
            requires_approval=request.intent == "apply_fix",
            proposed_patch="# offline fallback suggestion" if request.intent == "apply_fix" else None,
            status=ChatStatus.FALLBACK,
            error_class=error.error_class,
            fallback_used=True,
        )

    @staticmethod
    def _fallback_context(run_id: str | None) -> str:
        if not run_id:
            return "No run selected."
        try:
            run = run_service.get_run(run_id)
        except KeyError:
            return "Run context unavailable."
        if not run.comparison or not run.comparison.first_mismatch:
            return "No mismatch detected yet."
        mismatch = run.comparison.first_mismatch
        return f"First mismatch is {mismatch.series_name} at {mismatch.timestamp.isoformat()} with classification {mismatch.classification}."


chat_service = ChatService()
