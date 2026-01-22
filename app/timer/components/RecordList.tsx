import { TimeRecord } from '../../types/timer';

interface RecordListProps {
  records: TimeRecord[];
}

export default function RecordList({ records }: RecordListProps) {
  const formatDate = (date: Date) => {
    const d = new Date(date);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const formatDuration = (ms: number) => {
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

  if (records.length === 0) {
    return (
      <div className="text-black text-center py-8">
        記録がありません
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <div
          key={record.id}
          className="bg-gray-50 rounded-lg p-4 border border-gray-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm text-black">開始</div>
              <div className="font-semibold text-black">{formatDate(record.startTime)}</div>
            </div>
            {record.stopTime && (
              <div className="text-right">
                <div className="text-sm text-black">停止</div>
                <div className="font-semibold text-black">{formatDate(record.stopTime)}</div>
              </div>
            )}
          </div>
          <div className="mt-2 text-lg font-bold text-blue-600">
            経過時間: {formatDuration(record.elapsedMs)}
          </div>
        </div>
      ))}
    </div>
  );
}
