import { TimeRecord } from '../types/timer';
import { supabase } from './supabase';

interface TimeRecordDTO {
  id: string;
  user_id: string;
  start_time: string;
  stop_time: string | null;
  elapsed_ms: number;
  status: string;
}

const convertDTOToTimeRecord = (dto: TimeRecordDTO): TimeRecord => ({
  id: dto.id,
  startTime: new Date(dto.start_time),
  stopTime: dto.stop_time ? new Date(dto.stop_time) : undefined,
  elapsedMs: dto.elapsed_ms,
  status: dto.status as 'idle' | 'running' | 'paused',
});

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
  };
};

export const fetchTimeRecords = async (): Promise<TimeRecord[]> => {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/time-records', { headers });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch time records');
  }

  const data: TimeRecordDTO[] = await response.json();
  return data.map(convertDTOToTimeRecord);
};

export const saveTimeRecord = async (record: TimeRecord): Promise<TimeRecord> => {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/time-records', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      startTime: record.startTime.toISOString(),
      stopTime: record.stopTime?.toISOString() || null,
      elapsedMs: record.elapsedMs,
      status: record.status,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save time record');
  }

  const data: TimeRecordDTO = await response.json();
  return convertDTOToTimeRecord(data);
};

export const updateTimeRecord = async (
  id: string,
  record: Partial<TimeRecord>
): Promise<TimeRecord> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/time-records/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      startTime: record.startTime?.toISOString(),
      stopTime: record.stopTime?.toISOString() || null,
      elapsedMs: record.elapsedMs,
      status: record.status,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update time record');
  }

  const data: TimeRecordDTO = await response.json();
  return convertDTOToTimeRecord(data);
};

export const deleteTimeRecord = async (id: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/time-records/${id}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete time record');
  }
};
