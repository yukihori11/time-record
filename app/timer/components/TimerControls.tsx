import { TimerStatus } from '../../types/timer';

interface TimerControlsProps {
  status: TimerStatus;
  onStart: () => void;
  onStop: () => void;
  onResume: () => void;
}

export default function TimerControls({ status, onStart, onStop, onResume }: TimerControlsProps) {
  return (
    <div className="flex gap-4">
      {status === 'idle' && (
        <button
          onClick={onStart}
          className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold"
        >
          START
        </button>
      )}

      {status === 'running' && (
        <button
          onClick={onStop}
          className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-semibold"
        >
          STOP
        </button>
      )}

      {status === 'paused' && (
        <button
          onClick={onResume}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
        >
          RESUME
        </button>
      )}
    </div>
  );
}
