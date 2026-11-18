import { useMemo, useState } from 'react';
import { Expense } from '../../shared/types';
import { useAuth } from '../../app/App';
import Select from '../../shared/components/Select';
import { useI18n, categoryLabel, TKey } from '../../shared/i18n';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, BarChart, Bar, ReferenceLine, Legend,
} from 'recharts';
import { addDays, getDate, getDay } from 'date-fns';
import { moneyMonth, moneyMonthDay } from '../../shared/lib/moneyMonth';
import { useStartDay } from '../../app/useStartDay';

const COLORS = ['#F97C45', '#14b8a6', '#F5B942', '#EE5578', '#9B7BD4', '#4AA3DF'];
const WEEKDAYS: TKey[] = ['weekday.sun', 'weekday.mon', 'weekday.tue', 'weekday.wed', 'weekday.thu', 'weekday.fri', 'weekday.sat'];

type View = 'category' | 'account' | 'pace' | 'weekday' | 'compare';
const VIEWS: { id: View; label: TKey; subtitle: TKey }[] = [
  { id: 'category', label: 'charts.view.category', subtitle: 'charts.sub.category' },
  { id: 'account', label: 'charts.view.account', subtitle: 'charts.sub.account' },
  { id: 'pace', label: 'charts.view.pace', subtitle: 'charts.sub.pace' },
  { id: 'weekday', label: 'charts.view.weekday', subtitle: 'charts.sub.weekday' },
  { id: 'compare', label: 'charts.view.compare', subtitle: 'charts.sub.compare' },
];

interface Props {
  expenses: Expense[];
  symbol: string;
  budget?: number;
}

export default function SpendingCharts({ expenses, symbol, budget = 0 }: Props) {
  const { isDarkMode } = useAuth();
  const { t } = useI18n();
  const [view, setView] = useState<View>('category');

  // This and last money month (Profile > Month starts on)
  const startDay = useStartDay();
  const now = new Date();
  const thisStart = moneyMonth(now, startDay).start.getTime();
  const lastStart = moneyMonth(now, startDay, -1).start.getTime();
  const lastEnd = thisStart;

  const data = useMemo(() => {
    const thisMonth = expenses.filter(e => new Date(e.date).getTime() >= thisStart);
    const lastMonth = expenses.filter(e => {
      const t = new Date(e.date).getTime();
      return t >= lastStart && t < lastEnd;
    });

    const byCat = (list: Expense[]) => {
      const m: Record<string, number> = {};
      list.forEach(e => { m[e.category] = (m[e.category] || 0) + e.amount; });
      return m;
    };
    const thisCat = byCat(thisMonth);
    const lastCat = byCat(lastMonth);

    const category = Object.entries(thisCat)
      .map(([name, value]) => ({ name: categoryLabel(t, name), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Cumulative spend by day for this and last money month: position 1 is the start day, labelled with its date
    const { day: today, length: days } = moneyMonthDay(now, startDay);
    const position = (iso: string) => moneyMonthDay(new Date(iso), startDay).day;
    const perDayThis = new Array(days + 1).fill(0);
    thisMonth.forEach(e => { perDayThis[Math.min(position(e.date), days)] += e.amount; });
    const perDayLast = new Array(33).fill(0);
    lastMonth.forEach(e => { perDayLast[Math.min(position(e.date), 32)] += e.amount; });
    let cumThis = 0, cumLast = 0;
    const pace = Array.from({ length: days }, (_, i) => {
      const d = i + 1;
      cumLast += perDayLast[d];
      if (d <= today) cumThis += perDayThis[d];
      return {
        day: getDate(addDays(new Date(thisStart), i)),
        spent: d <= today ? cumThis : null,
        lastMonth: cumLast,
        budget: budget > 0 ? Math.round((budget / days) * d) : null,
      };
    });

    const wd = new Array(7).fill(0);
    thisMonth.forEach(e => { wd[getDay(new Date(e.date))] += e.amount; });
    const peak = Math.max(...wd);
    const weekday = WEEKDAYS.map((key, i) => ({ name: t(key), total: wd[i], isPeak: peak > 0 && wd[i] === peak }));

    const compareCats = Array.from(new Set([...Object.keys(thisCat), ...Object.keys(lastCat)]))
      .sort((a, b) => ((thisCat[b] || 0) + (lastCat[b] || 0)) - ((thisCat[a] || 0) + (lastCat[a] || 0)))
      .slice(0, 5)
      .map(name => ({ name: categoryLabel(t, name), thisMonth: thisCat[name] || 0, lastMonth: lastCat[name] || 0 }));

    const byAccount: Record<string, number> = {};
    thisMonth.forEach(e => {
      const key = e.accountName || t('charts.notSpecified');
      byAccount[key] = (byAccount[key] || 0) + e.amount;
    });
    const account = Object.entries(byAccount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { category, account, pace, weekday, compare: compareCats, hasData: thisMonth.length > 0 || lastMonth.length > 0 };
  }, [expenses, budget, thisStart, lastStart, lastEnd, t]);

  const axisTick = { fontSize: 11, fill: '#9A8478' };
  const grid = isDarkMode ? '#3A2B25' : '#F1E1D5';
  const tooltipStyle = {
    backgroundColor: 'rgba(43, 27, 20, 0.92)',
    backdropFilter: 'blur(8px)',
    border: 'none',
    borderRadius: '16px',
    color: 'white',
  };
  const fmt = (v: any) => (v == null ? '' : `${symbol}${Math.round(Number(v)).toLocaleString()}`);

  const renderChart = () => {
    switch (view) {
      case 'category':
        return (
          <>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.category} cx="50%" cy="50%" innerRadius={65} outerRadius={85} paddingAngle={8} dataKey="value" stroke="none">
                    {data.category.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'white', fontWeight: 'bold' }} formatter={fmt} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6">
              {data.category.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2 bg-background/50 p-2 rounded-xl border border-card-border">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[12px] text-slate-600 dark:text-slate-400 font-bold truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </>
        );
      case 'account':
        return data.account.length === 0 ? (
          <p className="h-40 flex items-center justify-center text-sm text-muted font-medium">{t('charts.empty')}</p>
        ) : (
          <div className="w-full" style={{ height: Math.max(160, data.account.length * 48) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.account} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={grid} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={axisTick} />
                <YAxis type="category" dataKey="name" width={110} axisLine={false} tickLine={false} tick={{ ...axisTick, fontSize: 10 }} />
                <Tooltip cursor={{ fill: 'rgba(249,124,69,0.08)' }} contentStyle={tooltipStyle} itemStyle={{ color: 'white', fontWeight: 'bold' }} formatter={fmt} />
                <Bar dataKey="value" name={t('charts.spent')} radius={[0, 6, 6, 0]}>
                  {data.account.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      case 'pace':
        return (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.pace} margin={{ left: -10, right: 8 }}>
                <defs>
                  <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F97C45" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#F97C45" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={axisTick} interval={4} />
                <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'white', fontWeight: 'bold' }} labelFormatter={d => t('charts.day', { day: d })} formatter={fmt} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="lastMonth" name={t('charts.lastMonth')} stroke="#9A8478" strokeDasharray="4 4" fill="none" dot={false} />
                {budget > 0 && <Area type="linear" dataKey="budget" name={t('charts.budgetPace')} stroke="#14b8a6" strokeDasharray="6 4" fill="none" dot={false} />}
                <Area type="monotone" dataKey="spent" name={t('charts.thisMonth')} stroke="#F97C45" strokeWidth={3} fill="url(#paceFill)" dot={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      case 'weekday':
        return (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weekday} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} />
                <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                <Tooltip cursor={{ fill: 'rgba(249,124,69,0.08)' }} contentStyle={tooltipStyle} itemStyle={{ color: 'white', fontWeight: 'bold' }} formatter={fmt} />
                <Bar dataKey="total" name={t('charts.spent')} radius={[6, 6, 0, 0]}>
                  {data.weekday.map((d, i) => <Cell key={i} fill={d.isPeak ? '#F97C45' : (isDarkMode ? '#4A372F' : '#F6E3D6')} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      case 'compare':
        return (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.compare} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ ...axisTick, fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                <Tooltip cursor={{ fill: 'rgba(249,124,69,0.08)' }} contentStyle={tooltipStyle} itemStyle={{ color: 'white', fontWeight: 'bold' }} formatter={fmt} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="lastMonth" name={t('charts.lastMonth')} fill={isDarkMode ? '#4A372F' : '#E8D2C3'} radius={[6, 6, 0, 0]} />
                <Bar dataKey="thisMonth" name={t('charts.thisMonth')} fill="#F97C45" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
    }
  };

  if (!data.hasData) return null;

  return (
    <div className="bg-card p-6 rounded-[2.5rem] shadow-soft border border-card-border transition-all">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-lg font-bold text-foreground">{t('charts.title')}</h3>
          <p className="text-muted text-xs font-medium mt-0.5">{t(VIEWS.find(v => v.id === view)!.subtitle)}</p>
        </div>
        <Select
          variant="pill"
          ariaLabel={t('charts.viewLabel')}
          value={view}
          onChange={(v) => setView(v as View)}
          options={VIEWS.map(v => ({ value: v.id, label: t(v.label) }))}
        />
      </div>
      {renderChart()}
    </div>
  );
}
