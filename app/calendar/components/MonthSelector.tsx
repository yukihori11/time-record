interface MonthSelectorProps {
  selectedMonth: Date;
  onChangeMonth: (delta: number) => void;
  onGoToCurrentMonth: () => void;
}

export default function MonthSelector({
  selectedMonth,
  onChangeMonth,
  onGoToCurrentMonth,
}: MonthSelectorProps) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
      <div className="flex justify-between items-center">
        <button
          onClick={() => onChangeMonth(-1)}
          className="px-4 py-2 bg-gray-200 text-black rounded-lg hover:bg-gray-300 transition-colors"
        >
          ← 前月
        </button>

        <h1 className="text-2xl font-bold text-black">
          {selectedMonth.getFullYear()}年{selectedMonth.getMonth() + 1}月
        </h1>

        <div className="flex gap-2">
          <button
            onClick={onGoToCurrentMonth}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            今月
          </button>
          <button
            onClick={() => onChangeMonth(1)}
            className="px-4 py-2 bg-gray-200 text-black rounded-lg hover:bg-gray-300 transition-colors"
          >
            次月 →
          </button>
        </div>
      </div>
    </div>
  );
}
