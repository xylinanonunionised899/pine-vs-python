export type StreamEvent = {
  run_id: string;
  lifecycle: string;
  current_index: number;
  total: number;
  comparison?: Record<string, unknown> | null;
  updated_at: string;
};

export function connectRunStream(runId: string, onEvent: (event: StreamEvent) => void): WebSocket {
  const socket = new WebSocket(`ws://127.0.0.1:8000/runs/${runId}/stream`);
  socket.onmessage = (event) => onEvent(JSON.parse(event.data) as StreamEvent);
  return socket;
}
