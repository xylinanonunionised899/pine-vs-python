import { useEffect, useState } from "react";
import type { StreamEvent } from "@/services/websocket";
import { connectRunStream } from "@/services/websocket";

export function useComparatorSession(runId: string | null) {
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);

  useEffect(() => {
    if (!runId) {
      return;
    }
    const socket = connectRunStream(runId, setLastEvent);
    return () => socket.close();
  }, [runId]);

  return { lastEvent };
}
