import type { StrategyArtifact } from "@shared/contracts";
import { StrategyEditor } from "./StrategyEditor";

type PythonEditorProps = {
  artifact: StrategyArtifact;
  onChange: (next: StrategyArtifact) => void;
};

export function PythonEditor({ artifact, onChange }: PythonEditorProps) {
  return <StrategyEditor artifact={artifact} title="Python inbox" language="python" badge="Local runtime" accentClass="python" onChange={onChange} />;
}
