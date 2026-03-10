import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import type { StrategyArtifact } from "@shared/contracts";

type StrategyEditorProps = {
  artifact: StrategyArtifact;
  title: string;
  language: "python" | "javascript";
  badge: string;
  accentClass: string;
  onChange: (next: StrategyArtifact) => void;
  onEditorMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
};

export function StrategyEditor({ artifact, title, language, badge, accentClass, onChange, onEditorMount }: StrategyEditorProps) {
  return (
    <section className="editor-shell">
      <div className="editor-header">
        <div>
          <p className="eyebrow">{badge}</p>
          <h2>{title}</h2>
        </div>
        <div className={`permission-badge ${accentClass}`}>{artifact.permissions.write_allowed ? "Write-enabled" : "Read-only for LLM"}</div>
      </div>
      <div className="editor-meta">
        <span>{artifact.name}</span>
        <span>{artifact.declared_outputs.join(" | ") || "No outputs declared"}</span>
      </div>
      <Editor
        height="280px"
        defaultLanguage={language}
        language={language}
        value={artifact.source_code}
        theme="vs-dark"
        onChange={(value) => onChange({ ...artifact, source_code: value ?? "" })}
        onMount={(editorInstance, monacoInstance) => {
          onEditorMount?.(editorInstance, monacoInstance);
        }}
        options={{ minimap: { enabled: false }, fontFamily: "IBM Plex Mono", fontSize: 13, wordWrap: "on", scrollBeyondLastLine: false }}
      />
    </section>
  );
}
