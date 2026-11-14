import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { startOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { db } from '../../shared/firebase';
import { useAuth } from '../../app/App';
import { Account, Deposit, Expense } from '../../shared/types';
import { accountDisplayName } from './accounts';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';

interface Props {
  expenses: Expense[];
  accounts: Account[];
  symbol: string;
}

/** This month's money in (monthly deposits) and out (expenses) for each account, plus current balances */
export default function AccountsReport({ expenses, accounts, symbol }: Props) {
  const { user, isDarkMode } = useAuth();
  const { t } = useI18n();
  const [deposits, setDeposits] = useState<Deposit[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'deposits'), where('uid', '==', user.uid));
    return onSnapshot(q, (snapshot) => {
      setDeposits(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Deposit)));
    });
  }, [user]);

  const rows = useMemo(() => {
    const monthStart = startOfMonth(new Date()).getTime();
    const inMonth = (iso: string) => new Date(iso).getTime() >= monthStart;
    return accounts.map(a => ({
      name: accountDisplayName(a),
      balance: a.balance,
      moneyIn: deposits.filter(d => d.accountId === a.id && inMonth(d.date)).reduce((s, d) => s + d.amount, 0),
      moneyOut: expenses.filter(e => e.accountId === a.id && inMonth(e.date)).reduce((s, e) => s + e.amount, 0),
    }));
  }, [accounts, deposits, expenses]);

  if (accounts.length === 0) return null;

  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const fmt = (v: any) => `${symbol}${Math.round(Number(v)).toLocaleString()}`;
  const axisTick = { fontSize: 10, fill: '#9A8478' };

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border transition-colors space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">{t('accountsReport.title')}</h3>
          <p className="text-muted text-xs font-medium mt-0.5">{t('accountsReport.subtitle')}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-muted">{t('common.total')}</p>
          <p className={cn('font-bold tabular-nums', total < 0 ? 'text-rose-500' : 'text-foreground')}>{fmt(total)}</p>
        </div>
      </div>

      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ left: -10, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#3A2B25' : '#F1E1D5'} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} interval={0} tickFormatter={(n: string) => (n.length > 12 ? `${n.slice(0, 11)}…` : n)} />
            <YAxis axisLine={false} tickLine={false} tick={axisTick} />
            <Tooltip
              cursor={{ fill: 'rgba(249,124,69,0.08)' }}
              contentStyle={{ backgroundColor: 'rgba(43, 27, 20, 0.92)', border: 'none', borderRadius: '16px', color: 'white' }}
              itemStyle={{ color: 'white', fontWeight: 'bold' }}
              formatter={fmt}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="moneyIn" name={t('accountsReport.moneyIn')} fill="#14b8a6" radius={[6, 6, 0, 0]} />
            <Bar dataKey="moneyOut" name={t('charts.spent')} fill="#F97C45" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.name} className="flex items-center justify-between gap-3 p-3 bg-background/50 rounded-xl">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{r.name}</p>
              <p className="text-[12px] text-muted font-medium">
                <span className="text-teal-600 dark:text-teal-400">+{fmt(r.moneyIn)}</span>
                {' · '}
                <span className="text-orange-600 dark:text-orange-400">-{fmt(r.moneyOut)}</span>
              </p>
            </div>
            <p className={cn('text-sm font-bold tabular-nums', r.balance < 0 ? 'text-rose-500' : 'text-foreground')}>{fmt(r.balance)}</p>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted font-medium">{t('accountsReport.note')}</p>
    </div>
  );
}
