import CalendarDay from './CalendarDay';

interface DayData {
  date: Date;
  workMs: number;
  breakMs: number;
  workPeriods: { start: Date; end: Date }[];
  breakPeriods: { start: Date; end: Date }[];
}

interface CalendarGridProps {
  calendarData: (DayData | null)[];
  onDayClick: (dayData: DayData) => void;
}

export default function CalendarGrid({ calendarData, onDayClick }: CalendarGridProps) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-6">
      <div className="grid grid-cols-7 gap-2">
        {/* Day headers */}
        {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
          <div
            key={day}
            className={`text-center font-bold py-2 ${
              index === 0 ? 'text-red-600' : index === 6 ? 'text-blue-600' : 'text-black'
            }`}
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarData.map((dayData, index) => (
          <CalendarDay key={index} dayData={dayData} onClick={onDayClick} />
        ))}
      </div>
    </div>
  );
}
