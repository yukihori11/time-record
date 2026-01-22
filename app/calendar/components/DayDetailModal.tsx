import { formatDuration } from '../../utils/dateUtils';
import { formatTimeRange } from '../../utils/timeRounding';

interface DayData {
  date: Date;
  workMs: number;
  breakMs: number;
  workPeriods: { start: Date; end: Date }[];
  breakPeriods: { start: Date; end: Date }[];
}

interface DayDetailModalProps {
  dayData: DayData | null;
  onClose: () => void;
}

export default function DayDetailModal({ dayData, onClose }: DayDetailModalProps) {
  if (!dayData) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-black mb-4">
          {dayData.date.getFullYear()}年{dayData.date.getMonth() + 1}月
          {dayData.date.getDate()}日
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-sm text-black">稼働時間</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatDuration(dayData.workMs)}
            </div>
          </div>
          <div>
            <div className="text-sm text-black">休憩時間</div>
            <div className="text-2xl font-bold text-orange-600">
              {formatDuration(dayData.breakMs)}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-black mb-2">稼働時間帯</h3>
            <div className="space-y-2">
              {dayData.workPeriods.map((period, index) => (
                <div key={index} className="bg-blue-50 px-3 py-2 rounded text-black">
                  {formatTimeRange(period.start, period.end)}
                </div>
              ))}
            </div>
          </div>

          {dayData.breakPeriods.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-black mb-2">休憩時間帯</h3>
              <div className="space-y-2">
                {dayData.breakPeriods.map((period, index) => (
                  <div key={index} className="bg-orange-50 px-3 py-2 rounded text-black">
                    {formatTimeRange(period.start, period.end)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-2 bg-gray-200 text-black rounded-lg hover:bg-gray-300 transition-colors"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
