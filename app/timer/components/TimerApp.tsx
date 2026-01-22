'use client';

import { useState, useMemo, useEffect } from 'react';
import TimerControls from './TimerControls';
import TimeDisplay from './TimeDisplay';
import DailySummary from './DailySummary';
import { TimeRecord, TimerStatus } from '../../types/timer';
import { groupRecordsByDate } from '../../utils/dateUtils';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { saveTimeRecord, fetchTimeRecords } from '../../lib/apiService';
import Navigation from '../../components/Navigation';

export default function TimerApp() {
  const [status, setStatus] = useState<TimerStatus>('idle');
  const [currentStartTime, setCurrentStartTime] = useState<Date | null>(null);
  const [totalElapsedMs, setTotalElapsedMs] = useState(0);
  const [records, setRecords, isLoaded] = useLocalStorage<TimeRecord[]>('timeRecords', []);

  // Load records from Supabase on mount
  useEffect(() => {
    const loadRecords = async () => {
      try {
        const data = await fetchTimeRecords();
        setRecords(data);
      } catch (error) {
        console.error('Failed to load records from Supabase:', error);
      }
    };

    if (isLoaded) {
      loadRecords();
    }
  }, [isLoaded]);

  const handleStart = () => {
    const now = new Date();
    setCurrentStartTime(now);
    setStatus('running');
  };

  const handleStop = async () => {
    if (!currentStartTime) return;

    const now = new Date();
    const sessionElapsedMs = now.getTime() - currentStartTime.getTime();

    const newRecord: TimeRecord = {
      id: Date.now().toString(),
      startTime: currentStartTime,
      stopTime: now,
      elapsedMs: sessionElapsedMs,
      status: 'paused',
    };

    setRecords((prev) => [newRecord, ...prev]);
    setTotalElapsedMs((prev) => prev + sessionElapsedMs);
    setStatus('paused');

    // Save to Supabase
    try {
      await saveTimeRecord(newRecord);
    } catch (error) {
      console.error('Failed to save record to Supabase:', error);
    }
  };

  const handleResume = () => {
    const now = new Date();
    setCurrentStartTime(now);
    setStatus('running');
  };

  const getCurrentElapsedMs = () => {
    if (status === 'running' && currentStartTime) {
      return totalElapsedMs + (Date.now() - currentStartTime.getTime());
    }
    return totalElapsedMs;
  };

  const dailyRecords = useMemo(() => groupRecordsByDate(records), [records]);

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
      <Navigation />
      <div className="py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h1 className="text-3xl font-bold text-black mb-8 text-center">
            時間記録アプリ
          </h1>

          <div className="flex flex-col items-center gap-8">
            <TimeDisplay
              elapsedMs={getCurrentElapsedMs()}
              isRunning={status === 'running'}
            />

            <TimerControls
              status={status}
              onStart={handleStart}
              onStop={handleStop}
              onResume={handleResume}
            />
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-black mb-6">日別集計</h2>
          <DailySummary dailyRecords={dailyRecords} />
        </div>
      </div>
      </div>
    </div>
  );
}
