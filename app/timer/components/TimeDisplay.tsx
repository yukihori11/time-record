'use client';

import { useEffect, useState } from 'react';

interface TimeDisplayProps {
  elapsedMs: number;
  isRunning: boolean;
}

export default function TimeDisplay({ elapsedMs, isRunning }: TimeDisplayProps) {
  const [displayMs, setDisplayMs] = useState(elapsedMs);

  useEffect(() => {
    setDisplayMs(elapsedMs);
  }, [elapsedMs]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setDisplayMs((prev) => prev + 10);
    }, 10);

    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);

    return {
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
      milliseconds: String(milliseconds).padStart(2, '0'),
    };
  };

  const time = formatTime(displayMs);

  return (
    <div className="text-6xl font-mono font-bold text-black">
      {time.hours}:{time.minutes}:{time.seconds}.{time.milliseconds}
    </div>
  );
}
