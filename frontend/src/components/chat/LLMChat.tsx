import { useMemo, useState } from "react";

import type { ChatResponse, ComparisonResult, OllamaModelInfo, PermissionGrant, StrategyArtifact } from "@shared/contracts";

type LLMChatProps = {
  approvals: PermissionGrant[];
  pineArtifact: StrategyArtifact;
  pythonArtifact: StrategyArtifact;
  comparison: ComparisonResult | null;
  onAsk: (prompt: string) => void;
  busy: boolean;
  availableModels: OllamaModelInfo[];
  model: string;
  onModelChange: (model: string) => void;
  onRefreshModels: () => void;
  response: ChatResponse | null;
};

const starterMessages = [
  "Explain the first mismatch between Pine and Python.",
  "Suggest a fix for the Python implementation.",
  "List what I should verify before enabling write access.",
];

function getChatCapableModels(models: OllamaModelInfo[]): OllamaModelInfo[] {
  return models.filter((item) => item.chat_capable !== false);
}

function describeResponseState(response: ChatResponse | null, busy: boolean, model: string, chatModels: OllamaModelInfo[]): string {
  if (busy) {
    return "Waiting for Ollama response...";
  }
  if (chatModels.length === 0) {
    return "No local chat model available.";
  }
  if (!response) {
    return `Model connected: ${model}`;
  }
  if (response.status === "fallback") {
    if (response.error_class === "timeout") {
      return "Fallback response used because the selected model timed out.";
    }
    if (response.error_class === "model_missing") {
      return "Fallback response used because the selected model is missing.";
    }
    if (response.error_class === "cleaned_response_empty") {
      return "Fallback response used because Ollama returned no clean plain-text answer.";
    }
    if (response.error_class === "ollama_unreachable") {
      return "Fallback response used because Ollama is unreachable.";
    }
    return "Fallback response used.";
  }
  if (response.status === "error") {
    return response.error_class === "permission_required" ? "Write permission is required before applying a patch." : "Chat request failed.";
  }
  return `Model connected: ${response.model}`;
}

export function LLMChat({ approvals, pineArtifact, pythonArtifact, comparison, onAsk, busy, availableModels, model, onModelChange, onRefreshModels, response }: LLMChatProps) {
  const [prompt, setPrompt] = useState(starterMessages[0]);
  const writePending = approvals.some((approval) => approval.access === "write" && !approval.approved);
  const chatModels = useMemo(() => getChatCapableModels(availableModels), [availableModels]);
  const connectionState = describeResponseState(response, busy, model, chatModels);

  return (
    <section className="surface sidebar-card chat-card">
      <div className="sidebar-header">
        <div>
          <p className="eyebrow">Local assistant</p>
          <h2>Ollama chat</h2>
        </div>
        <span className="pill">{model}</span>
      </div>

      <div className="summary-box">
        <p>{connectionState}</p>
        <p>{comparison?.first_mismatch ? `Current mismatch context: ${comparison.first_mismatch.series_name}` : "No mismatch context loaded yet."}</p>
      </div>

      <div className="chat-transcript">
        {!response && !busy ? <article className="chat-bubble system">Ask a question about Pine/Python parity, indicator drift, or strategy fixes.</article> : null}
        {busy ? <article className="chat-bubble assistant">Waiting for the selected local model to answer. Cold starts on this machine can take a while.</article> : null}
        {response ? <article className="chat-bubble assistant">{response.content}</article> : null}
        <article className="chat-bubble system">
          Pine write access: {pineArtifact.permissions.write_allowed ? "enabled" : "approval required"}. Python write access: {pythonArtifact.permissions.write_allowed ? "enabled" : "approval required"}.
        </article>
      </div>

      <div className="field">
        <span>Connected model</span>
        <div className="action-row">
          <select value={model} onChange={(event) => onModelChange(event.target.value)}>
            {chatModels.length > 0 ? chatModels.map((item) => (
              <option key={item.name} value={item.name}>{item.name}</option>
            )) : <option value="offline-fallback">offline-fallback</option>}
          </select>
          <button className="action-button secondary" type="button" onClick={onRefreshModels}>Refresh models</button>
        </div>
      </div>

      <div className="prompt-grid">
        {starterMessages.map((message) => (
          <button key={message} className="prompt-chip" type="button" onClick={() => setPrompt(message)}>{message}</button>
        ))}
      </div>

      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6} />
      <button className="action-button" type="button" onClick={() => onAsk(prompt)}>{busy ? "Asking..." : "Ask LLM"}</button>

      <div className="summary-box">
        <p>{writePending ? "A write action is pending approval." : "No pending write approvals."}</p>
        <p>{chatModels.length > 0 ? `${chatModels.length} local chat model(s) detected.` : "No local chat model detected. Chat will use offline fallback."}</p>
      </div>
    </section>
  );
}
