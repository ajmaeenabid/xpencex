import { useState, useEffect } from 'react';
import { db } from '../../shared/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { Expense } from '../../shared/types';
import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { format, startOfMonth, subMonths, eachMonthOfInterval } from 'date-fns';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { FileDown, FileText } from 'lucide-react';
import SpendingCharts from './SpendingCharts';
import AccountsReport from '../accounts/AccountsReport';
import FeesCard from './FeesCard';
import RegretCard from './RegretCard';
import { useI18n, categoryLabel } from '../../shared/i18n';
import { useAccounts } from '../accounts/accountService';
import { toCSV, downloadFile, buildReportHtml, printReport } from './reportExport';
import { RearrangeButton, RearrangeList, useRearrange } from '../../shared/components/Rearrange';
import { alertDialog } from '../../shared/components/Dialog';

// Movable cards, in their default order
const REPORT_SECTIONS = ['export', 'analysis', 'accounts', 'fees', 'regret', 'monthly', 'breakdown'];

export default function ReportsPage() {
  const { user, profile, isDarkMode } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const accounts = useAccounts(user?.uid);
  const { t, dateLocale } = useI18n();
  const layout = useRearrange('reports', REPORT_SECTIONS);

  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'expenses'), where('uid', '==', user.uid), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    });
    return unsubscribe;
  }, [user]);

  const monthlyData = eachMonthOfInterval({
    start: subMonths(new Date(), 5),
    end: new Date()
  }).map(month => {
    const monthStr = format(month, 'MMM');
    const total = expenses
      .filter(exp => format(new Date(exp.date), 'MMM yyyy') === format(month, 'MMM yyyy'))
      .reduce((sum, exp) => sum + exp.amount, 0);
    return { name: monthStr, total };
  });

  const categoryData = expenses.reduce((acc: any[], exp) => {
    const existing = acc.find(item => item.name === exp.category);
    if (existing) {
      existing.value += exp.amount;
    } else {
      acc.push({ name: exp.category, value: exp.amount });
    }
    return acc;
  }, []).sort((a, b) => b.value - a.value);

  const grandTotal = expenses.reduce((s, e) => s + e.amount, 0);

  const handleMonthlyPdf = () => {
    const monthStart = startOfMonth(new Date()).getTime();
    const html = buildReportHtml({
      title: t('reports.pdfTitle', { month: format(new Date(), 'MMMM yyyy', { locale: dateLocale }) }),
      expenses: expenses.filter(e => new Date(e.date).getTime() >= monthStart),
      symbol: currencySymbol,
      name: profile?.name,
      budget: profile?.monthlyBudget,
    });
    if (!printReport(html)) alertDialog(t('reports.allowPopups'));
  };

  const handleCsv = () =>
    downloadFile(`xpencex-all-expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`, toCSV(expenses, profile?.currency || 'BDT'), 'text/csv;charset=utf-8');

  const COLORS = ['#F97C45', '#14b8a6', '#F5B942', '#EE5578', '#9B7BD4', '#4AA3DF'];

  return (
    <div className="space-y-6 pb-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{t('reports.title')}</h1>
          <p className="text-muted text-sm font-medium">{t('reports.subtitle')}</p>
        </div>
        <RearrangeButton layout={layout} />
      </header>

      {/* The cards below can be moved with the button at the top; the header stays */}
      <RearrangeList layout={layout} className="space-y-6" sections={[
      { id: 'export', node: (
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleMonthlyPdf}
          disabled={expenses.length === 0}
          className="flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-vibrant disabled:opacity-50 disabled:shadow-none"
        >
          <FileText size={16} /> {t('reports.monthlyPdf')}
        </button>
        <button
          onClick={handleCsv}
          disabled={expenses.length === 0}
          className="flex items-center justify-center gap-2 py-3 bg-card text-foreground border border-card-border rounded-2xl text-sm font-bold disabled:opacity-50"
        >
          <FileDown size={16} /> {t('reports.exportCsv')}
        </button>
      </div>
      ) },

      { id: 'analysis', node: <SpendingCharts expenses={expenses} symbol={currencySymbol} budget={profile?.monthlyBudget} /> },

      { id: 'accounts', node: <AccountsReport expenses={expenses} accounts={accounts} symbol={currencySymbol} /> },

      { id: 'fees', node: <FeesCard expenses={expenses} symbol={currencySymbol} /> },

      { id: 'regret', node: user && <RegretCard uid={user.uid} expenses={expenses} symbol={currencySymbol} /> },

      { id: 'monthly', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border transition-colors">
        <h3 className="text-lg font-bold mb-6 text-foreground">{t('reports.monthly')}</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#3A2B25' : '#F1E1D5'} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9A8478' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9A8478' }} />
              <Tooltip
                cursor={{ fill: isDarkMode ? 'rgba(255,148,98,0.08)' : 'rgba(249,124,69,0.08)' }}
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#2A1E19' : '#FFFBF8', 
                  borderRadius: '12px', 
                  border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)', 
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  color: isDarkMode ? '#ffffff' : '#000000'
                }}
              />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {monthlyData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === monthlyData.length - 1 ? '#F97C45' : (isDarkMode ? '#3A2B25' : '#F6E3D6')} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      ) },

      { id: 'breakdown', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border transition-colors">
        <h3 className="text-lg font-bold mb-6 text-foreground">{t('reports.breakdown')}</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#2A1E19' : '#FFFBF8', 
                  borderRadius: '12px', 
                  border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
                  color: isDarkMode ? '#ffffff' : '#000000'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3 mt-6">
          {categoryData.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-sm font-bold text-muted">{categoryLabel(t, item.name)}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-foreground">{currencySymbol} {item.value.toLocaleString()}</span>
                <span className="text-[10px] text-muted font-bold ml-2">
                  {grandTotal > 0 ? ((item.value / grandTotal) * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      ) },
      ]} />
    </div>
  );
}
