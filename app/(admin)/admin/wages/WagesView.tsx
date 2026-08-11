'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HourlyWage, UserProfile } from '@/app/types/domain';
import { api, errorMessage } from '@/app/lib/client/fetcher';
import { todayJst } from '@/app/lib/domain/datetime';
import { formatYen } from '@/app/lib/domain/format';
import { resolveWage } from '@/app/lib/domain/wage-history';
import Button from '@/app/components/ui/Button';
import { Field, Input, Select } from '@/app/components/ui/Field';
import {
  Card,
  ErrorBanner,
  SuccessBanner,
  Spinner,
} from '@/app/components/ui/Feedback';

export default function WagesView() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [wages, setWages] = useState<HourlyWage[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [amount, setAmount] = useState('1000');
  const [effectiveFrom, setEffectiveFrom] = useState(() => todayJst());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [userRes, wageRes] = await Promise.all([
        api.get<{ users: UserProfile[] }>('/api/users'),
        api.get<{ wages: HourlyWage[] }>('/api/admin/wages'),
      ]);
      // 時給を設定するのはバイト生のみ。管理者は対象外。
      setUsers(
        userRes.users.filter((u) => u.isActive && u.role === 'staff')
      );
      setWages(wageRes.wages);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      await api.post('/api/admin/wages', {
        userId: selectedUser,
        hourlyWage: Number(amount),
        effectiveFrom,
      });
      setSuccess('時給を登録しました');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const today = todayJst();

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <Card className="p-4">
        <h2 className="font-bold text-slate-900 mb-3">時給を設定する</h2>
        <form onSubmit={submit} className="space-y-3">
          <Field label="スタッフ" required>
            <Select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              required
            >
              <option value="">選択してください</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="時給（円）" required>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={99999}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="適用開始日" required>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </Field>
          </div>

          <p className="text-xs text-slate-500">
            適用開始日より前の勤務は、当時の時給で計算されます。
          </p>

          <Button type="submit" fullWidth loading={saving} disabled={!selectedUser}>
            登録する
          </Button>
        </form>
      </Card>

      {/* スタッフごとの現在の時給と履歴 */}
      {users.map((user) => {
        const history = wages
          .filter((w) => w.userId === user.id)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
        const current = resolveWage(history, today);

        return (
          <Card key={user.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-900">
                {user.name || user.email}
              </h3>
              <span className="font-bold text-blue-600">
                {current === null ? '未設定' : formatYen(current)}
              </span>
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-slate-400">
                時給が未設定です。給与が計算されません。
              </p>
            ) : (
              <ul className="space-y-1">
                {history.map((w) => (
                  <li
                    key={w.id}
                    className={`flex justify-between text-sm px-2.5 py-1.5 rounded-lg ${
                      w.effectiveFrom <= today &&
                      w.effectiveFrom === history.find((h) => h.effectiveFrom <= today)?.effectiveFrom
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    <span>{w.effectiveFrom} 〜</span>
                    <span className="tabular-nums">{formatYen(w.hourlyWage)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
