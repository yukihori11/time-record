import { DailyRecord } from '../../utils/dateUtils';
import { formatDuration, formatTime } from '../../utils/dateUtils';

interface DailySummaryProps {
  dailyRecords: DailyRecord[];
}

export default function DailySummary({ dailyRecords }: DailySummaryProps) {
  if (dailyRecords.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {dailyRecords.map((daily) => (
        <div
          key={daily.date}
          className="bg-white rounded-2xl shadow-xl p-6 border-l-4 border-blue-500"
        >
          <h3 className="text-xl font-bold text-black mb-4">{daily.date}</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-sm text-black">合計稼働時間</div>
              <div className="text-2xl font-bold text-blue-600">
                {formatDuration(daily.totalMs)}
              </div>
            </div>
            <div>
              <div className="text-sm text-black">休憩時間</div>
              <div className="text-2xl font-bold text-orange-600">
                {formatDuration(daily.breakMs)}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-sm font-semibold text-black mb-2">稼働・休憩時間帯</div>
            {daily.records
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
              .flatMap((record, index, sortedRecords) => {
                const elements = [];

                // Add work session
                elements.push(
                  <div key={record.id} className="flex items-center gap-2 text-sm text-black bg-blue-50 px-3 py-2 rounded">
                    <span className="font-medium">
                      {formatTime(record.startTime)} 〜 {record.stopTime ? formatTime(record.stopTime) : '計測中'}
                    </span>
                    <span className="text-gray-600">
                      ({formatDuration(record.elapsedMs)})
                    </span>
                  </div>
                );

                // Add break period if there's a next session
                if (index < sortedRecords.length - 1 && record.stopTime) {
                  const nextRecord = sortedRecords[index + 1];
                  const breakMs = new Date(nextRecord.startTime).getTime() - new Date(record.stopTime).getTime();

                  if (breakMs > 0) {
                    elements.push(
                      <div key={`break-${record.id}`} className="flex items-center gap-2 text-sm text-black bg-orange-50 px-3 py-2 rounded">
                        <span className="font-medium">
                          {formatTime(record.stopTime)} 〜 {formatTime(nextRecord.startTime)}
                        </span>
                        <span className="text-gray-600">
                          休憩 ({formatDuration(breakMs)})
                        </span>
                      </div>
                    );
                  }
                }

                return elements;
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
