// Round time to next 30-minute mark
// 12:00-12:29 -> 12:00
// 12:30-12:59 -> 13:00

export const roundToNext30Minutes = (date: Date): Date => {
  const newDate = new Date(date);
  const minutes = newDate.getMinutes();

  if (minutes >= 30) {
    // Round up to next hour
    newDate.setHours(newDate.getHours() + 1);
    newDate.setMinutes(0);
  } else {
    // Round down to current hour
    newDate.setMinutes(0);
  }

  newDate.setSeconds(0);
  newDate.setMilliseconds(0);

  return newDate;
};

export const formatTimeRange = (start: Date, end: Date): string => {
  const roundedStart = roundToNext30Minutes(start);
  const roundedEnd = roundToNext30Minutes(end);

  const formatTime = (date: Date) => {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return `${formatTime(roundedStart)}~${formatTime(roundedEnd)}`;
};

export const calculateRoundedDuration = (start: Date, end: Date): number => {
  const roundedStart = roundToNext30Minutes(start);
  const roundedEnd = roundToNext30Minutes(end);
  return roundedEnd.getTime() - roundedStart.getTime();
};
