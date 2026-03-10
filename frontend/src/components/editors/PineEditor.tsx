import { useEffect, useRef } from "react";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import type { StrategyArtifact } from "@shared/contracts";
import type { PineError } from "@/services/pineExecutionService";
import { StrategyEditor } from "./StrategyEditor";

type PineEditorProps = {
  artifact: StrategyArtifact;
  onChange: (next: StrategyArtifact) => void;
  errors?: PineError[];
};

export function PineEditor({ artifact, onChange, errors = [] }: PineEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleEditorMount = (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;
  };

  // Reactively set/clear Monaco error markers when errors prop changes
  useEffect(() => {
    const monaco = monacoRef.current;
    const editorInstance = editorRef.current;
    if (!monaco || !editorInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;

    if (errors.length === 0) {
      monaco.editor.setModelMarkers(model, "pine-ts", []);
      return;
    }

    monaco.editor.setModelMarkers(
      model,
      "pine-ts",
      errors.map((err) => ({
        severity: monaco.MarkerSeverity.Error,
        message: err.message,
        startLineNumber: err.line,
        startColumn: err.column,
        endLineNumber: err.line,
        endColumn: err.column + 20,
      })),
    );
  }, [errors]);

  return (
    <StrategyEditor
      artifact={artifact}
      title="Pine inbox"
      language="javascript"
      badge="TradingView-facing"
      accentClass="pine"
      onChange={onChange}
      onEditorMount={handleEditorMount}
    />
  );
}
