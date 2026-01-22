import { formatDuration } from '../../utils/dateUtils';

interface DayData {
  date: Date;
  workMs: number;
  breakMs: number;
  workPeriods: { start: Date; end: Date }[];
  breakPeriods: { start: Date; end: Date }[];
}

interface CalendarDayProps {
  dayData: DayData | null;
  onClick: (dayData: DayData) => void;
}

export default function CalendarDay({ dayData, onClick }: CalendarDayProps) {
  if (!dayData) {
    return <div className="min-h-24 p-2 border border-gray-200 rounded bg-gray-100" />;
  }

  return (
    <div
      onClick={() => onClick(dayData)}
      className="min-h-24 p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50"
    >
      <div className="text-sm font-semibold text-black mb-1">
        {dayData.date.getDate()}
      </div>
      {dayData.workMs > 0 ? (
        <div className="text-xs">
          <div className="text-blue-600 font-medium">
            稼働: {formatDuration(dayData.workMs)}
          </div>
          {dayData.breakMs > 0 && (
            <div className="text-orange-600">
              休憩: {formatDuration(dayData.breakMs)}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
