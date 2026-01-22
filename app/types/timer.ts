export type TimerStatus = 'idle' | 'running' | 'paused';

export interface TimeRecord {
  id: string;
  startTime: Date;
  stopTime?: Date;
  elapsedMs: number;
  status: TimerStatus;
}

export interface TimerSession {
  records: TimeRecord[];
  totalElapsedMs: number;
  currentStartTime?: Date;
  status: TimerStatus;
}
