'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { TimeRecord } from '../../types/timer';
import { fetchTimeRecords } from '../../lib/apiService';
import { roundToNext30Minutes, calculateRoundedDuration } from '../../utils/timeRounding';
import Navigation from '../../components/Navigation';
import MonthSelector from './MonthSelector';
import CalendarGrid from './CalendarGrid';
import DayDetailModal from './DayDetailModal';

interface DayData {
  date: Date;
  workMs: number;
  breakMs: number;
  workPeriods: { start: Date; end: Date }[];
  breakPeriods: { start: Date; end: Date }[];
}

export default function CalendarView() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [records, setRecords, isLoaded] = useLocalStorage<TimeRecord[]>('timeRecords', []);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  useEffect(() => {
    const loadRecords = async () => {
      try {
        const data = await fetchTimeRecords();
        if (data.length > 0) {
          setRecords(data);
        }
      } catch (error) {
        console.error('Failed to load records:', error);
      }
    };

    if (isLoaded) {
      loadRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const calendarData = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    const days: (DayData | null)[] = [];

    // Add empty cells for days before the 1st
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add all days in the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayRecords = records.filter((record) => {
        const recordDate = new Date(record.startTime);
        return (
          recordDate.getFullYear() === year &&
          recordDate.getMonth() === month &&
          recordDate.getDate() === day
        );
      });

      const sortedRecords = dayRecords.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

      const workPeriods: { start: Date; end: Date }[] = [];
      const breakPeriods: { start: Date; end: Date }[] = [];
      let totalWorkMs = 0;
      let totalBreakMs = 0;

      sortedRecords.forEach((record, index) => {
        if (record.stopTime) {
          const roundedStart = roundToNext30Minutes(record.startTime);
          const roundedEnd = roundToNext30Minutes(record.stopTime);
          const duration = calculateRoundedDuration(record.startTime, record.stopTime);

          workPeriods.push({ start: roundedStart, end: roundedEnd });
          totalWorkMs += duration;

          // Calculate break period
          if (index < sortedRecords.length - 1 && sortedRecords[index + 1].startTime) {
            const nextRecord = sortedRecords[index + 1];
            const breakStart = roundedEnd;
            const breakEnd = roundToNext30Minutes(nextRecord.startTime);
            const breakDuration = breakEnd.getTime() - breakStart.getTime();

            if (breakDuration > 0) {
              breakPeriods.push({ start: breakStart, end: breakEnd });
              totalBreakMs += breakDuration;
            }
          }
        }
      });

      days.push({
        date,
        workMs: totalWorkMs,
        breakMs: totalBreakMs,
        workPeriods,
        breakPeriods,
      });
    }

    return days;
  }, [records, selectedMonth]);

  const changeMonth = (delta: number) => {
    setSelectedMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + delta);
      return newDate;
    });
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(new Date());
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
      <Navigation />
      <div className="py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <MonthSelector
            selectedMonth={selectedMonth}
            onChangeMonth={changeMonth}
            onGoToCurrentMonth={goToCurrentMonth}
          />
          <CalendarGrid calendarData={calendarData} onDayClick={setSelectedDay} />
          <DayDetailModal dayData={selectedDay} onClose={() => setSelectedDay(null)} />
        </div>
      </div>
    </div>
  );
}
