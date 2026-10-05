'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  IcalFeedStatus,
  PayrollSettings,
  Property,
  ReservationType,
  UserProfile,
} from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { formatYen } from '@/app/lib/domain/format';
import { amountFromMinutes } from '@/app/lib/domain/payroll';
import { roundMinutes } from '@/app/lib/domain/rounding';
import { useAuth } from '@/app/contexts/AuthContext';
import Button from '@/app/components/ui/Button';
import { Field, Input, Select } from '@/app/components/ui/Field';
import NotificationStatus from '@/app/components/NotificationStatus';
import {
  Card,
  ErrorBanner,
  SuccessBanner,
  Spinner,
} from '@/app/components/ui/Feedback';

export default function SettingsView() {
  const { user: me, reload } = useAuth();
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [types, setTypes] = useState<ReservationType[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<{
    userId: string;
    password: string;
    label: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [settingsRes, propRes, typeRes, userRes] = await Promise.all([
        api.get<{ settings: PayrollSettings }>('/api/admin/settings'),
        api.get<{ properties: Property[] }>('/api/properties?all=1'),
        api.get<{ types: ReservationType[] }>('/api/reservation-types?all=1'),
        api.get<{ users: UserProfile[] }>('/api/users'),
      ]);
      setSettings(settingsRes.settings);
      setProperties(propRes.properties);
      setTypes(typeRes.types);
      setUsers(userRes.users);
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

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.patch('/api/admin/settings', settings);
      setSuccess('給与ルールを保存しました');
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (userId: string, role: 'admin' | 'staff') => {
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/api/admin/users/${userId}`, { role });
      setSuccess('権限を変更しました');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggleActive = async (userId: string, isActive: boolean) => {
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/api/admin/users/${userId}`, { isActive });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  /**
   * パスワードを再発行する。
   *
   * 本人がメールを受け取れない場合の手段。
   * ログインできる人は設定画面から自分で変えられる。
   */
  const resetPassword = async (userId: string, label: string) => {
    if (!window.confirm(`${label} のパスワードを再発行しますか？`)) return;

    setInviteBusyId(userId);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post<{ password: string }>(
        `/api/admin/users/${userId}/password`
      );
      setNewPassword({ userId, password: res.password, label });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setInviteBusyId(null);
    }
  };

  if (loading || !settings) return <Spinner />;

  // 設定変更の影響が分かるよう、具体例で金額を出す
  const preview = (minutes: number, wage = 1000) => {
    const rounded = roundMinutes(
      minutes,
      settings.roundingMinutes,
      settings.roundingMode
    );
    // 下限を「超えた」ときだけ保証が発動する
    const guaranteed =
      minutes > settings.guaranteeThresholdMinutes
        ? settings.minGuaranteedMinutes
        : 0;
    return amountFromMinutes(Math.max(guaranteed, rounded), wage);
  };

  // 管理者が直接作成するようになったため、招待中の区別は不要。
  // 過去に招待した人が残っている可能性があるので全員を出す。
  const activeUsers = users;

  // 境界の前後が分かる例を並べる
  const threshold = settings.guaranteeThresholdMinutes;
  const guarantee = settings.minGuaranteedMinutes;
  const previewRows = Array.from(
    new Set(
      [
        30,
        threshold,
        threshold + 1,
        guarantee,
        guarantee + 10,
        guarantee + 60,
      ].filter((m) => m > 0)
    )
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {/* 通知。承諾・辞退を受け取るために管理者も有効にする必要がある */}
      <NotificationStatus />

      {/* 自分のパスワード。管理者もここから変えられる */}
      <MyPasswordSection />

      {/* 給与ルール */}
      <Card className="p-4">
        <h2 className="font-bold text-slate-900 mb-3">給与の計算ルール</h2>

        <div className="space-y-3">
          <Field
            label="端数の扱い"
            hint="切り上げはスタッフに有利、切り捨ては経営側に有利"
          >
            <Select
              value={settings.roundingMode}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  roundingMode: e.target.value as 'up' | 'down',
                })
              }
            >
              <option value="up">切り上げ</option>
              <option value="down">切り捨て</option>
            </Select>
          </Field>

          <Field label="丸めの単位">
            <Select
              value={String(settings.roundingMinutes)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  roundingMinutes: Number(e.target.value),
                })
              }
            >
              {[1, 5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m}分
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="保証が発動する時間（分）"
            hint="この時間を「超えた」ら保証が付く。ちょうどの場合は実時間どおり"
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={1440}
              step={15}
              value={settings.guaranteeThresholdMinutes}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  guaranteeThresholdMinutes: Number(e.target.value),
                })
              }
            />
          </Field>

          <Field
            label="保証する時間（分）"
            hint="発動したときに支給する時間。1日あたり1回だけ適用される"
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={1440}
              step={15}
              value={settings.minGuaranteedMinutes}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  minGuaranteedMinutes: Number(e.target.value),
                })
              }
            />
          </Field>
        </div>

        {/* 変更の影響をその場で確認できるようにする */}
        <div className="mt-4 p-3 bg-slate-50 rounded-xl">
          <p className="text-xs font-bold text-slate-600 mb-2">
            時給1000円の場合の支給額
          </p>
          <ul className="space-y-1 text-sm">
            {previewRows.map((minutes) => {
              const applied = minutes > settings.guaranteeThresholdMinutes;
              const rounded = roundMinutes(
                minutes,
                settings.roundingMinutes,
                settings.roundingMode
              );
              const isGuarantee =
                applied && settings.minGuaranteedMinutes > rounded;

              return (
                <li
                  key={minutes}
                  className="flex justify-between text-slate-600"
                >
                  <span>
                    {Math.floor(minutes / 60) > 0 &&
                      `${Math.floor(minutes / 60)}時間`}
                    {minutes % 60 > 0 && `${minutes % 60}分`}
                    {isGuarantee && (
                      <span className="ml-1.5 text-xs text-emerald-600 font-semibold">
                        保証
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatYen(preview(minutes))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-xs text-amber-600 mt-3">
          設定を変更すると過去の月の金額も変わります。
        </p>

        <Button fullWidth className="mt-3" loading={saving} onClick={saveSettings}>
          保存する
        </Button>
      </Card>

      {/* 棟の管理 */}
      <PropertySection properties={properties} onChanged={load} />

      {/* Airbnb のカレンダーの取り込み */}
      <IcalFeedSection properties={properties} />

      {/* 予定の種別 */}
      <TypeSection types={types} onChanged={load} />

      {/* スタッフの追加 */}
      <InviteSection onInvited={load} />

      {/* 再発行したパスワード。ここでしか見られない */}
      {newPassword && (
        <Card className="p-4 border-amber-300 bg-amber-50">
          <h2 className="font-bold text-slate-900 mb-1">
            {newPassword.label} のパスワードを再発行しました
          </h2>
          <p className="text-xs text-amber-700 mb-3">
            この画面でしか確認できません。本人に伝えてから閉じてください。
          </p>

          <p className="text-lg font-bold text-slate-900 font-mono tracking-wide bg-white rounded-lg px-3 py-2 border border-amber-200">
            {newPassword.password}
          </p>

          <div className="flex gap-2 mt-3">
            <Button
              size="md"
              fullWidth
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(newPassword.password);
                  setSuccess('パスワードをコピーしました');
                } catch {
                  setError('コピーできませんでした');
                }
              }}
            >
              コピー
            </Button>
            <Button
              size="md"
              variant="secondary"
              onClick={() => setNewPassword(null)}
            >
              閉じる
            </Button>
          </div>
        </Card>
      )}

      {/* 利用中 */}
      <Card className="p-4">
        <h2 className="font-bold text-slate-900 mb-3">スタッフと権限</h2>

        {activeUsers.length === 0 ? (
          <p className="text-sm text-slate-400">利用中のスタッフはいません</p>
        ) : (
          <ul className="space-y-2">
            {activeUsers.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {u.name || u.email}
                    {u.id === me?.id && (
                      <span className="ml-1.5 text-xs text-blue-600">自分</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={u.role}
                    onChange={(e) =>
                      changeRole(u.id, e.target.value as 'admin' | 'staff')
                    }
                    className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
                  >
                    <option value="staff">バイト生</option>
                    <option value="admin">管理者</option>
                  </select>

                  <button
                    onClick={() => toggleActive(u.id, !u.isActive)}
                    className={`text-xs px-2 py-1.5 rounded-lg font-semibold ${
                      u.isActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {u.isActive ? '有効' : '無効'}
                  </button>

                  <button
                    onClick={() => resetPassword(u.id, u.name || u.email)}
                    disabled={inviteBusyId === u.id}
                    className="text-xs px-2 py-1.5 rounded-lg font-semibold text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                    title="パスワードを再発行する"
                  >
                    鍵
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PropertySection({
  properties,
  onChanged,
}: {
  properties: Property[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#10b981');
  const capacity = '4';
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await api.post('/api/properties', {
        name,
        color,
        capacity: Number(capacity),
        displayOrder: properties.length + 1,
      });
      setName('');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    setError(null);
    try {
      await api.patch(`/api/properties/${id}`, patch);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card className="p-4">
      <h2 className="font-bold text-slate-900 mb-3">民泊の棟</h2>
      <ErrorBanner message={error} />

      <ul className="space-y-2 mb-4">
        {properties.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50"
          >
            <input
              type="color"
              value={p.color}
              onChange={(e) => update(p.id, { color: e.target.value })}
              className="w-8 h-8 rounded-lg border-0 cursor-pointer shrink-0"
              aria-label={`${p.name}の色`}
            />
            <input
              defaultValue={p.name}
              onBlur={(e) => {
                if (e.target.value !== p.name) {
                  update(p.id, { name: e.target.value });
                }
              }}
              className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-800 px-1 py-1 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span className="text-xs text-slate-400 shrink-0">
              定員{p.capacity ?? '—'}
            </span>
            <button
              onClick={() => update(p.id, { isActive: !p.isActive })}
              className={`text-xs px-2 py-1.5 rounded-lg font-semibold shrink-0 ${
                p.isActive
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {p.isActive ? '運用中' : '停止'}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex gap-2 items-end">
        <div className="flex-1">
          <Field label="棟を追加">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="C棟"
              required
            />
          </Field>
        </div>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-11 h-11 rounded-lg border-0 cursor-pointer shrink-0"
          aria-label="色"
        />
        <Button type="submit" loading={adding} disabled={!name}>
          追加
        </Button>
      </form>
    </Card>
  );
}

/**
 * Airbnb のカレンダー（iCal）の取り込み。
 *
 * 棟ごとに Airbnb の「カレンダーをエクスポート」の URL を貼る。
 * URL を知っていれば誰でも予約日程を読めるため、管理者にだけ見せる。
 */
function IcalFeedSection({ properties }: { properties: Property[] }) {
  const [feeds, setFeeds] = useState<IcalFeedStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadFeeds = useCallback(async () => {
    try {
      const res = await api.get<{ feeds: IcalFeedStatus[] }>('/api/admin/ical-feeds');
      setFeeds(res.feeds);
      setDrafts(Object.fromEntries(res.feeds.map((f) => [f.propertyId, f.icalUrl])));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void loadFeeds();
  }, [loadFeeds]);

  const save = async (propertyId: string) => {
    setSavingId(propertyId);
    setError(null);
    setSuccess(null);
    try {
      await api.put('/api/admin/ical-feeds', {
        propertyId,
        icalUrl: drafts[propertyId] ?? '',
      });
      // 保存したらすぐ取り込んで、URL が正しいかをその場で分かるようにする
      const res = await api.post<{ results?: { propertyId: string; ok: boolean; error?: string }[] }>(
        '/api/ical/sync',
        { force: true }
      );
      const mine = res.results?.find((r) => r.propertyId === propertyId);
      if (mine && !mine.ok) setError(mine.error ?? '取り込みに失敗しました');
      else setSuccess(drafts[propertyId] ? '保存して取り込みました' : '連携をやめました');
      await loadFeeds();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  const feedMap = new Map(feeds.map((f) => [f.propertyId, f]));

  return (
    <Card className="p-4">
      <h2 className="font-bold text-slate-900 mb-1">Airbnb 連携</h2>
      <p className="text-xs text-slate-500 mb-3">
        Airbnb の「カレンダー」→「カレンダーの同期」→「カレンダーをエクスポート」の URL を棟ごとに貼ります。
        取り込めるのは日付だけで、名前・人数はカレンダーから手で入力します。
      </p>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <ul className="space-y-3">
        {properties
          .filter((p) => p.isActive)
          .map((p) => {
            const feed = feedMap.get(p.id);
            const draft = drafts[p.id] ?? '';
            const changed = draft !== (feed?.icalUrl ?? '');

            return (
              <li key={p.id} className="p-2.5 rounded-xl bg-slate-50 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-semibold text-slate-800 flex-1">{p.name}</span>
                  {feed && (
                    <span
                      className={`text-xs font-semibold ${
                        feed.lastError ? 'text-red-600' : 'text-slate-400'
                      }`}
                    >
                      {feed.lastError
                        ? '取り込みエラー'
                        : feed.lastSyncedAt
                          ? `最終同期 ${new Date(feed.lastSyncedAt).toLocaleString('ja-JP', {
                              timeZone: 'Asia/Tokyo',
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : '未同期'}
                    </span>
                  )}
                </div>
                {feed?.lastError && (
                  <p className="text-xs text-red-600">{feed.lastError}</p>
                )}
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <Input
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      placeholder="https://www.airbnb.jp/calendar/ical/..."
                      inputMode="url"
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    onClick={() => save(p.id)}
                    loading={savingId === p.id}
                    disabled={!changed}
                  >
                    保存
                  </Button>
                </div>
              </li>
            );
          })}
      </ul>
    </Card>
  );
}

/**
 * 予定の種別（宿泊・清掃など）。
 * 運用に合わせて増やせるようにしている。
 */
function TypeSection({
  types,
  onChanged,
}: {
  types: ReservationType[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8b5cf6');
  const [icon, setIcon] = useState('');
  const [hasGuests, setHasGuests] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await api.post('/api/reservation-types', {
        name,
        color,
        icon,
        hasGuests,
        displayOrder: types.length + 1,
      });
      setName('');
      setIcon('');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    setError(null);
    try {
      await api.patch(`/api/reservation-types/${id}`, patch);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card className="p-4">
      <h2 className="font-bold text-slate-900 mb-1">予定の種別</h2>
      <p className="text-xs text-slate-500 mb-3">
        カレンダーの色分けに使います。「客あり」は宿泊人数を入力する種別です。
      </p>
      <ErrorBanner message={error} />

      <ul className="space-y-2 mb-4">
        {types.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50"
          >
            <input
              type="color"
              value={t.color}
              onChange={(e) => update(t.id, { color: e.target.value })}
              className="w-8 h-8 rounded-lg border-0 cursor-pointer shrink-0"
              aria-label={`${t.name}の色`}
            />
            <input
              defaultValue={t.icon}
              onBlur={(e) => {
                if (e.target.value !== t.icon) {
                  update(t.id, { icon: e.target.value });
                }
              }}
              className="w-10 text-center bg-transparent text-lg px-1 py-1 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="アイコン"
            />
            <input
              defaultValue={t.name}
              onBlur={(e) => {
                if (e.target.value !== t.name) {
                  update(t.id, { name: e.target.value });
                }
              }}
              className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-800 px-1 py-1 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span
              className={`text-xs px-2 py-1 rounded-lg font-semibold shrink-0 ${
                t.hasGuests
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {t.hasGuests ? '客あり' : '作業'}
            </span>
            {/* チェックイン当日にこの種別の予定があれば「清掃手配済み」とみなす */}
            <button
              onClick={() => update(t.id, { isCleaning: !t.isCleaning })}
              className={`text-xs px-2 py-1.5 rounded-lg font-semibold shrink-0 ${
                t.isCleaning
                  ? 'bg-teal-100 text-teal-700'
                  : 'bg-slate-100 text-slate-400'
              }`}
              title="チェックイン当日の清掃の判定に使う"
            >
              {t.isCleaning ? '清掃' : '清掃外'}
            </button>
            <button
              onClick={() => update(t.id, { isActive: !t.isActive })}
              className={`text-xs px-2 py-1.5 rounded-lg font-semibold shrink-0 ${
                t.isActive
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {t.isActive ? '使用中' : '停止'}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="space-y-2">
        <div className="flex gap-2 items-end">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-11 h-11 rounded-lg border-0 cursor-pointer shrink-0"
            aria-label="色"
          />
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="🔑"
            maxLength={2}
            className="w-14 text-center px-2 py-3 rounded-xl border border-slate-300 bg-white text-lg"
            aria-label="アイコン"
          />
          <div className="flex-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="鍵の受け渡し"
              required
            />
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2 text-sm text-slate-600 flex-1">
            <input
              type="checkbox"
              checked={hasGuests}
              onChange={(e) => setHasGuests(e.target.checked)}
              className="w-4 h-4"
            />
            お客さんが滞在する
          </label>
          <Button type="submit" loading={adding} disabled={!name}>
            追加
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * バイト生の招待。
 *
 * メールアドレスを入れると招待メールが飛び、
 * 本人がリンクからパスワードを設定してログインする。
 * こちらでパスワードを決めて伝える必要がない。
 */
const APP_URL = 'https://time-record-kappa.vercel.app';

/**
 * スタッフに送る、通知の設定方法の案内文。
 *
 * iPhone は Safari で開いてホーム画面に追加し、そのアイコンから開かないと
 * 通知を有効にできない（usePushNotification の needsInstall / needsSafari）。
 * 手順や画面の文言を変えたら、ここも合わせて直すこと。
 */
const PUSH_GUIDE = [
  '【シフトの通知を受け取る設定】',
  'シフトが割り当てられたときにスマホへ通知が届きます。',
  '',
  '■ iPhone の場合',
  `1. Safari で ${APP_URL} を開く（LINE などのアプリ内では設定できません）`,
  '2. 画面下の共有ボタン（□に↑）→「ホーム画面に追加」',
  '3. ホーム画面に追加されたアイコンからアプリを開いてログイン',
  '4. 下のメニューの「設定」→「シフトの通知」の「通知を有効にする」を押す',
  '5. 「通知を許可しますか」と出たら「許可」',
  '',
  '■ Android の場合',
  `1. Chrome で ${APP_URL} を開いてログイン`,
  '2. 下のメニューの「設定」→「シフトの通知」の「通知を有効にする」を押す',
  '3. 「通知を許可しますか」と出たら「許可」',
  '',
  '「受け取る」と表示されれば設定完了です。',
  '機種を変えたときや別の端末で使うときは、その端末でもう一度設定してください。',
].join('\n');

/** 通知の設定方法の案内。そのままコピーしてスタッフに送れる */
function PushGuide() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(PUSH_GUIDE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('コピーできませんでした。下の文章を長押ししてコピーしてください');
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      <h3 className="text-sm font-bold text-slate-900 mb-1">通知の設定方法を送る</h3>
      <p className="text-xs text-slate-500 mb-2">
        スタッフがシフトの通知を受け取るための手順です。コピーして LINE などで送ってください。
      </p>
      <ErrorBanner message={error} />
      <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 whitespace-pre-wrap break-words font-sans leading-relaxed max-h-56 overflow-y-auto select-all">
        {PUSH_GUIDE}
      </pre>
      <Button size="md" fullWidth variant="secondary" className="mt-2" onClick={copy}>
        {copied ? 'コピーしました' : '通知の設定方法をコピー'}
      </Button>
    </div>
  );
}

/** ランダムなパスワードを作る。伝えやすさを優先して紛らわしい文字を除く */
function generatePassword(length = 10): string {
  // 0/O/1/l/I など見間違えやすい文字は入れない
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/**
 * スタッフの追加。
 *
 * こちらでパスワードまで決めて作り、本人には直接伝える。
 * 招待メールは届かない・迷惑メールに入る・期限切れになる、
 * といった問題があり、確実にログインしてもらえなかった。
 */
function InviteSection({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [password, setPassword] = useState(() => generatePassword());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);

    try {
      await api.post('/api/admin/users', { email, name, role, password });

      // 作成後にパスワードを表示する。ここでしか見られない。
      setCreated({ email, password });
      setEmail('');
      setName('');
      setRole('staff');
      setPassword(generatePassword());
      onInvited();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const copyToClipboard = async () => {
    if (!created) return;
    const text = [
      '民泊 勤怠アプリ',
      APP_URL,
      '',
      `ID: ${created.email}`,
      `パスワード: ${created.password}`,
      '',
      'ログイン後、設定からパスワードを変更できます',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('コピーできませんでした。手動で控えてください');
    }
  };

  // 作成直後。パスワードを伝えるための画面。
  if (created) {
    return (
      <Card className="p-4">
        <h2 className="font-bold text-slate-900 mb-1">スタッフを追加しました</h2>
        <p className="text-xs text-amber-600 mb-3">
          このパスワードはこの画面でしか確認できません。
          本人に伝えてから閉じてください。
        </p>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div>
            <p className="text-xs text-slate-500">ID（メールアドレス）</p>
            <p className="text-sm font-bold text-slate-900 break-all">
              {created.email}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">パスワード</p>
            <p className="text-lg font-bold text-slate-900 font-mono tracking-wide">
              {created.password}
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <Button size="md" fullWidth onClick={copyToClipboard}>
            {copied ? 'コピーしました' : '案内文をコピー'}
          </Button>
          <Button
            size="md"
            variant="secondary"
            onClick={() => setCreated(null)}
          >
            閉じる
          </Button>
        </div>

        <PushGuide />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="font-bold text-slate-900 mb-1">スタッフを追加</h2>
      <p className="text-xs text-slate-500 mb-3">
        パスワードはこちらで決めて本人に伝えます。
        バイト生を追加したら時給の設定を忘れずに。
      </p>

      <ErrorBanner message={error} />

      <form onSubmit={submit} className="space-y-3 mt-3">
        <Field label="メールアドレス" required hint="ログインIDになります">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@example.com"
            inputMode="email"
            required
          />
        </Field>

        <Field label="氏名">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="田中 太郎"
          />
        </Field>

        <Field
          label="権限"
          hint={
            role === 'admin'
              ? '管理者はシフトの割当や給与の確認ができます'
              : 'バイト生は打刻・給与確認・シフト回答ができます'
          }
        >
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as 'staff' | 'admin')}
          >
            <option value="staff">バイト生</option>
            <option value="admin">管理者</option>
          </Select>
        </Field>

        <Field label="初期パスワード" required hint="本人が後から変更できます">
          <div className="flex gap-2">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="font-mono"
            />
            <Button
              type="button"
              size="md"
              variant="secondary"
              onClick={() => setPassword(generatePassword())}
            >
              作り直す
            </Button>
          </div>
        </Field>

        <Button
          type="submit"
          fullWidth
          loading={sending}
          disabled={!email || password.length < 8}
        >
          このスタッフを追加する
        </Button>
      </form>

      {/* 追加済みのスタッフにも送れるよう、フォームの外に常に出しておく */}
      <PushGuide />
    </Card>
  );
}

/**
 * 自分のパスワードを変更する。
 *
 * 管理者も自分のパスワードを変えたい。
 * スタッフ一覧の「鍵」は他人への再発行なので、
 * 自分の分は別に用意する必要がある。
 */
function MyPasswordSection() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(null);

    if (password.length < 8) {
      setError('パスワードは8文字以上で設定してください');
      return;
    }
    if (password !== confirm) {
      setError('パスワードが一致しません');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/me/password', { password });
      setPassword('');
      setConfirm('');
      setDone('パスワードを変更しました');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <h2 className="font-bold text-slate-900 mb-1">自分のパスワード</h2>
      <p className="text-xs text-slate-500 mb-3">
        好きなパスワードを設定できます（8文字以上）
      </p>

      <ErrorBanner message={error} />
      <SuccessBanner message={done} />

      <form onSubmit={submit} className="space-y-3 mt-2">
        <Field label="新しいパスワード" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            required
          />
        </Field>

        <Field label="確認のためもう一度" required>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            required
          />
        </Field>

        <Button
          type="submit"
          fullWidth
          loading={saving}
          disabled={!password || !confirm}
        >
          パスワードを変更する
        </Button>
      </form>
    </Card>
  );
}
