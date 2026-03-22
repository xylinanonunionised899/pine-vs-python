from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

import httpx

from app.core.settings import settings
from app.models.contracts import ChatErrorClass, ChatRequest, ChatResponse, ChatStatus, OllamaModelInfo

ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
CONTROL_MARKER_RE = re.compile(r"<\|[^>]+?\|>")
THINK_BLOCK_RE = re.compile(r"(?is)<think>.*?</think>")
ANALYSIS_BLOCK_RE = re.compile(r"(?is)<analysis>.*?</analysis>")
ROLE_LINE_RE = re.compile(r"(?im)^\s*(system|user|assistant|tool):\s*(.*)$")


class OllamaChatError(Exception):
    def __init__(self, error_class: ChatErrorClass, detail: str) -> None:
        super().__init__(detail)
        self.error_class = error_class
        self.detail = detail


@dataclass(slots=True)
class OllamaChatResult:
    response: ChatResponse
    sanitized: bool


def is_chat_capable_model(model_name: str) -> bool:
    lowered = model_name.lower()
    return "embed" not in lowered


def sanitize_ollama_text(raw_text: str) -> tuple[str, bool]:
    cleaned = raw_text or ""
    original = cleaned
    cleaned = ANSI_ESCAPE_RE.sub("", cleaned)
    cleaned = THINK_BLOCK_RE.sub("", cleaned)
    cleaned = ANALYSIS_BLOCK_RE.sub("", cleaned)
    cleaned = CONTROL_MARKER_RE.sub(" ", cleaned)

    assistant_lines: list[str] = []
    plain_lines: list[str] = []
    transcript_detected = False
    for line in cleaned.splitlines():
        stripped = line.strip()
        match = ROLE_LINE_RE.match(stripped)
        if match:
            transcript_detected = True
            role = match.group(1).lower()
            content = match.group(2).strip()
            if role == "assistant" and content:
                assistant_lines.append(content)
            continue
        if not stripped:
            plain_lines.append("")
            continue
        if stripped.startswith("<") and stripped.endswith(">"):
            continue
        plain_lines.append(stripped)

    lines = assistant_lines if transcript_detected and assistant_lines else plain_lines

    paragraphs: list[str] = []
    seen: set[str] = set()
    for block in "\n".join(lines).split("\n\n"):
        paragraph = re.sub(r"\s+", " ", block).strip()
        if not paragraph:
            continue
        if paragraph not in seen:
            seen.add(paragraph)
            paragraphs.append(paragraph)

    cleaned = "\n\n".join(paragraphs).strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned, cleaned != original.strip()


class OllamaClient:
    def __init__(self, base_url: str = "http://127.0.0.1:11434") -> None:
        self.base_url = base_url.rstrip("/")
        self.bin_path = Path(settings.ollama_bin)

    def healthcheck(self) -> dict[str, str | bool]:
        return {"bin_exists": self.bin_path.exists(), "base_url": self.base_url}

    async def list_models(self) -> list[OllamaModelInfo]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                data = response.json()
        except Exception:
            return []

        models: list[OllamaModelInfo] = []
        for item in data.get("models", []):
            model_name = item.get("name", item.get("model", ""))
            models.append(
                OllamaModelInfo(
                    name=model_name,
                    model=item.get("model", model_name),
                    size=item.get("size"),
                    modified_at=item.get("modified_at"),
                    chat_capable=is_chat_capable_model(model_name),
                )
            )
        return models

    async def chat(self, request: ChatRequest) -> OllamaChatResult:
        latest_user_message = next((message.content for message in reversed(request.messages) if message.role == "user"), "").strip()
        if not latest_user_message:
            raise OllamaChatError(ChatErrorClass.CLEANED_RESPONSE_EMPTY, "No user prompt was provided to Ollama.")

        payload = {
            "model": request.model,
            "system": (
                "You are a local trading strategy comparison assistant. "
                "Answer only the user's latest request in plain text. "
                "Do not include analysis blocks, think tags, role labels, transcripts, JSON, or tokenizer markers."
            ),
            "prompt": latest_user_message,
            "stream": False,
            "options": {
                "temperature": 0.2,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=180) as client:
                response = await client.post(f"{self.base_url}/api/generate", json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.ConnectError as exc:
            raise OllamaChatError(ChatErrorClass.OLLAMA_UNREACHABLE, f"Ollama is not reachable at {self.base_url}.") from exc
        except httpx.TimeoutException as exc:
            raise OllamaChatError(ChatErrorClass.TIMEOUT, f"Model '{request.model}' took too long to answer.") from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise OllamaChatError(ChatErrorClass.MODEL_MISSING, f"Model '{request.model}' is not available locally.") from exc
            raise OllamaChatError(ChatErrorClass.OLLAMA_UNREACHABLE, f"Ollama returned HTTP {exc.response.status_code}.") from exc

        cleaned, sanitized = sanitize_ollama_text(str(data.get("response", "")))
        if not cleaned:
            raise OllamaChatError(ChatErrorClass.CLEANED_RESPONSE_EMPTY, f"Model '{request.model}' returned no usable plain-text answer.")

        requires_approval = request.intent == "apply_fix"
        return OllamaChatResult(
            response=ChatResponse(
                model=request.model,
                content=cleaned,
                requires_approval=requires_approval,
                proposed_patch=cleaned if requires_approval else None,
                status=ChatStatus.OK,
                fallback_used=False,
            ),
            sanitized=sanitized,
        )
