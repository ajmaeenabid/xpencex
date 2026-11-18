import { format } from 'date-fns';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../app/App';
import { useI18n } from '../../shared/i18n';
import type { ForecastPoint } from './forecast';

/** The expected balance for each of the next 30 days, with a line at zero. Downloads on its own, like the other charts. */
export default function ForecastChart({ points, symbol }: { points: ForecastPoint[]; symbol: string }) {
  const { t, dateLocale } = useI18n();
  const { isDarkMode } = useAuth();
  const data = points.map(p => ({ day: format(p.date, 'd MMM', { locale: dateLocale }), balance: p.balance }));
  const axisTick = { fontSize: 11, fill: '#9A8478' };
  const grid = isDarkMode ? '#3A2B25' : '#F1E1D5';
  const money = (v: unknown) => `${symbol}${Math.round(Number(v)).toLocaleString()}`;
  const short = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

  return (
    <div className="h-52 w-full" role="img" aria-label={t('planned.chartLabel')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -14, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={axisTick} interval={6} />
          <YAxis axisLine={false} tickLine={false} tick={axisTick} tickFormatter={short} />
          <ReferenceLine y={0} stroke="#EE5578" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: '#9A8478', strokeWidth: 1 }}
            contentStyle={{ backgroundColor: 'rgba(43, 27, 20, 0.92)', border: 'none', borderRadius: '16px', color: 'white' }}
            itemStyle={{ color: 'white', fontWeight: 'bold' }}
            formatter={(v) => [money(v), t('planned.chartBalance')]}
          />
          <Line type="monotone" dataKey="balance" stroke="#F97C45" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
