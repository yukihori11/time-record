'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { Card } from '@/app/components/ui/Feedback';

interface Notification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  kind: string;
  readAt: string | null;
  createdAt: string;
}

/** 「3分前」「2時間前」のような表記にする */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);

  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;

  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}日前`;

  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * お知らせの一覧。
 *
 * プッシュ通知は消してしまうと二度と見られないため、
 * ここで後から確認できるようにする。
 * 通知を許可していない人にとっては、ここが唯一の伝達手段になる。
 */
export default function NotificationList() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{
        notifications: Notification[];
        unreadCount: number;
      }>('/api/notifications');
      setItems(data.notifications);
      setUnread(data.unreadCount);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markAllRead = async () => {
    try {
      await api.patch('/api/notifications');
      setUnread(0);
      setItems((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // 読み込み中や、お知らせが無いときは場所を取らない
  if (loading || (items.length === 0 && !error)) return null;

  const visible = expanded ? items : items.slice(0, 3);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-slate-900">
          お知らせ
          {unread > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs">
              {unread}
            </span>
          )}
        </h2>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            すべて既読にする
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <ul className="space-y-2">
        {visible.map((n) => {
          const content = (
            <div
              className={`px-3 py-2.5 rounded-xl border ${
                n.readAt
                  ? 'border-slate-200 bg-white'
                  : 'border-blue-200 bg-blue-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  {n.title}
                </p>
                <span className="text-xs text-slate-400 shrink-0">
                  {timeAgo(n.createdAt)}
                </span>
              </div>
              {n.body && (
                <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">
                  {n.body}
                </p>
              )}
            </div>
          );

          return (
            <li key={n.id}>
              {n.link ? <Link href={n.link}>{content}</Link> : content}
            </li>
          );
        })}
      </ul>

      {items.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs text-slate-500 hover:text-slate-700 mt-2 py-1"
        >
          {expanded ? '閉じる' : `他${items.length - 3}件を見る`}
        </button>
      )}
    </Card>
  );
}
