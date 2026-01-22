import { TimeRecord } from '../types/timer';

export interface DailyRecord {
  date: string;
  totalMs: number;
  breakMs: number;
  records: TimeRecord[];
  startTime?: Date;
  endTime?: Date;
}

export const groupRecordsByDate = (records: TimeRecord[]): DailyRecord[] => {
  const grouped = new Map<string, DailyRecord>();

  records.forEach((record) => {
    const dateKey = new Date(record.startTime).toLocaleDateString('ja-JP');

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        date: dateKey,
        totalMs: 0,
        breakMs: 0,
        records: [],
      });
    }

    const daily = grouped.get(dateKey)!;
    daily.records.push(record);
    daily.totalMs += record.elapsedMs;

    // Update start time (earliest)
    if (!daily.startTime || record.startTime < daily.startTime) {
      daily.startTime = record.startTime;
    }

    // Update end time (latest)
    if (record.stopTime) {
      if (!daily.endTime || record.stopTime > daily.endTime) {
        daily.endTime = record.stopTime;
      }
    }
  });

  // Calculate break time for each day
  grouped.forEach((daily) => {
    if (daily.startTime && daily.endTime) {
      const totalTimeMs = daily.endTime.getTime() - daily.startTime.getTime();
      daily.breakMs = totalTimeMs - daily.totalMs;
      // Ensure break time is not negative
      if (daily.breakMs < 0) daily.breakMs = 0;
    }
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const dateA = new Date(a.records[0].startTime).getTime();
    const dateB = new Date(b.records[0].startTime).getTime();
    return dateB - dateA; // 新しい順
  });
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return '0秒';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}時間${minutes}分${seconds}秒`;
  } else if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  } else {
    return `${seconds}秒`;
  }
};

export const formatTime = (date: Date): string => {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
