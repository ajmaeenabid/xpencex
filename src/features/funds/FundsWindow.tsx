import { useCallback, useEffect, useRef, useState } from 'react';
import { addMonths, format } from 'date-fns';
import { CalendarDays, Check, ChevronRight, Pause, PiggyBank, Play, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../app/App';
import { useI18n, TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import FullWindow, { usePages } from '../../shared/components/FullWindow';
import ProgressRing from '../../shared/components/ProgressRing';
import DateField from '../../shared/components/DateField';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import { btnPrimary, btnSecondary, btnSmall, card, inputClass, labelClass } from '../accounts/ui';
import SheetsExportButton from '../connect/SheetsExportButton';
import AddToCalendarButton from '../connect/AddToCalendarButton';
import { fundsTabs } from '../connect/exportTables';
import { FESTIVALS, Festival, Fund, GOAL_IDEAS, GoalIdea, GoalStage, fundPlan, goalStage, mainSource, needsCelebration, quickAmounts } from './funds';
import { addToFund, createFund, deleteFund, markFundCelebrated, setFundPaused, takeFromFund } from './fundService';
import GoalCelebration from './GoalCelebration';
import { useAccounts } from '../accounts/accountService';
import AccountPicker from '../accounts/AccountPicker';
import type { Account } from '../../shared/types';

const PRESET_TEXT: Record<Festival | GoalIdea, TKey> = {
  eidFitr: 'funds.eidFitr',
  eidAdha: 'funds.eidAdha',
  durgaPuja: 'funds.durgaPuja',
  boishakh: 'funds.boishakh',
  christmas: 'funds.christmas',
  buddhaPurnima: 'funds.buddhaPurnima',
  emergency: 'funds.idea.emergency',
  gadget: 'funds.idea.gadget',
  hajj: 'funds.idea.hajj',
  wedding: 'funds.idea.wedding',
  admission: 'funds.idea.admission',
  trip: 'funds.idea.trip',
};

type Page = { page: 'list' } | { page: 'fund'; id: string } | { page: 'new' };

const ring = (f: Fund) => (f.paused ? 'text-slate-400' : fundPlan(f).reached ? 'text-emerald-500' : 'text-amber-500');

/** The full Savings goals window: all goals, one goal's page, and a new goal in three steps */
export default function FundsWindow({ open, onClose, uid, funds, symbol, startFundId }: {
  open: boolean;
  onClose: () => void;
  uid: string;
  funds: Fund[]; // sorted, nearest first
  symbol: string;
  startFundId?: string; // open straight on this goal (from the month-end suggestion)
}) {
  const { t, dateLocale } = useI18n();
  const { profile } = useAuth();
  const nav = usePages<Page>({ page: 'list' });
  const accounts = useAccounts(uid);
  useEffect(() => { if (open && startFundId) nav.go({ page: 'fund', id: startFundId }); }, [open, startFundId]);
  const [busy, setBusy] = useState(false);
  // A goal that just reached its target gets its one celebration, even when the AI put the last money in
  const [party, setParty] = useState<string | null>(null);
  const endParty = useCallback(() => setParty(null), []);
  const celebrated = useRef(new Set<string>());
  useEffect(() => {
    if (!open) return;
    const goal = funds.find(f => needsCelebration(f) && !celebrated.current.has(f.id));
    if (!goal) return;
    celebrated.current.add(goal.id);
    setParty(goal.name);
    markFundCelebrated(goal).catch(err => console.error('Could not save the goal celebration:', err));
  }, [open, funds]);
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const day = (iso: string) => format(new Date(iso), 'd MMM yyyy', { locale: dateLocale });
  const close = () => { onClose(); nav.reset(); };

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); return true; }
    catch (err) { console.error('Savings goal change failed:', err); alertDialog(t('funds.error')); return false; }
    finally { setBusy(false); }
  };

  /** "42 days left", "Today", "Passed", "Paused" or "Goal reached", with a colour */
  const when = (f: Fund) => {
    const p = fundPlan(f);
    if (f.paused) return { text: t('funds.paused'), tone: 'bg-background text-muted border border-card-border' };
    if (!f.dueDate && !p.reached) return { text: t('funds.noDate'), tone: 'bg-background text-muted border border-card-border' };
    if (p.reached) return { text: t('funds.dayReached'), tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' };
    if (p.passed) return { text: t('funds.dayPassed'), tone: 'bg-background text-muted border border-card-border' };
    if (p.daysLeft === 0) return { text: t('funds.dayToday'), tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' };
    return { text: t('funds.daysLeft', { days: p.daysLeft }), tone: p.daysLeft <= 14 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' };
  };

  let title = t('funds.title');
  let subtitle: string | undefined;
  let body: React.ReactNode;
  let action: React.ReactNode = null;

  /** One section of the list; the active goals come first and have no heading */
  const section = (stage: GoalStage, heading?: string) => {
    const goals = funds.filter(f => goalStage(f) === stage);
    if (goals.length === 0) return null;
    return (
      <div className="space-y-3">
        {heading && <h3 className="px-1 text-sm font-bold text-muted">{heading}</h3>}
        {goals.map(f => {
          const p = fundPlan(f);
          const w = when(f);
          return (
            <button key={f.id} onClick={() => nav.go({ page: 'fund', id: f.id })} className={cn(card, 'w-full p-4 flex items-center gap-4 text-left transition-colors hover:border-amber-500/40')}>
              <ProgressRing value={p.progress} colorClass={ring(f)} label={t('funds.percentLabel', { percent: Math.round(p.progress * 100) })}>
                <span className="text-xs font-bold tabular-nums">{Math.round(p.progress * 100)}%</span>
              </ProgressRing>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-bold text-foreground truncate">{f.name}</p>
                <p className="text-sm text-muted font-semibold tabular-nums truncate">{t('funds.detailOf', { saved: money(f.saved), target: money(f.target) })}</p>
                <span className={cn('inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-bold', w.tone)}>{w.text}</span>
              </div>
              <ChevronRight size={20} className="text-muted shrink-0" />
            </button>
          );
        })}
      </div>
    );
  };

  if (nav.page.page === 'list') {
    subtitle = funds.length ? t('funds.goalsCount', { count: funds.length }) : undefined;
    action = funds.length > 0 && (
      <button onClick={() => nav.go({ page: 'new' })} className={cn(btnSmall, 'bg-indigo-600 text-white hover:bg-indigo-700')}>
        <Plus size={15} /> {t('funds.newShort')}
      </button>
    );
    body = funds.length === 0 ? (
      <EmptyState
        title={t('funds.emptyTitle')}
        text={t('funds.emptyBody')}
        button={<button onClick={() => nav.go({ page: 'new' })} className={btnPrimary}><Plus size={16} /> {t('funds.new')}</button>}
      />
    ) : (
      <>
        <FundsHero funds={funds} money={money} />
        {section('active')}
        {section('reached', t('funds.sectionReached'))}
        {section('paused', t('funds.paused'))}
        <SheetsExportButton
          variant="wide"
          className="w-full"
          build={() => ({
            title: t('sheets.titleFunds', { date: format(new Date(), 'd MMM yyyy', { locale: dateLocale }) }),
            tabs: fundsTabs(funds, profile?.currency || 'BDT', t),
          })}
        />
      </>
    );
  } else if (nav.page.page === 'fund') {
    const id = nav.page.id;
    const fund = funds.find(f => f.id === id);
    if (fund) {
      title = fund.name;
      subtitle = fund.dueDate ? day(fund.dueDate) : t('funds.noDate');
      body = (
        <FundDetail
          fund={fund}
          busy={busy}
          money={money}
          symbol={symbol}
          when={when(fund)}
          accounts={accounts}
          onAdd={(amount, account) => act(() => addToFund(fund, amount, account))}
          onTake={(amount, account) => act(() => takeFromFund(fund, amount, account))}
          onPause={() => act(() => setFundPaused(fund, !fund.paused))}
          onDelete={async () => {
            if (!(await confirmDialog(t('funds.confirmDelete', { name: fund.name }), { danger: true }))) return;
            if (await act(() => deleteFund(fund))) nav.back();
          }}
          calendar={!!fund.dueDate && !fundPlan(fund).passed && (
            <AddToCalendarButton
              className="h-10 px-4 text-sm"
              event={{
                title: t('calendar.fundTitle', { name: fund.name }),
                date: new Date(fund.dueDate!),
                details: t('calendar.fundDetails', { target: money(fund.target), saved: money(fund.saved) }),
              }}
            />
          )}
        />
      );
    } else {
      body = <p className="text-center py-16 text-sm text-muted font-medium">{t('funds.gone')}</p>;
    }
  } else {
    title = t('funds.new');
    body = (
      <NewFund
        busy={busy}
        symbol={symbol}
        onCreate={async (name, target, date) => {
          if (await act(() => createFund(uid, name, target, date))) nav.back();
        }}
      />
    );
  }

  return (
    <>
      <FullWindow
        open={open}
        atRoot={nav.atRoot}
        onClose={close}
        onBack={nav.back}
        pageKey={nav.depth + nav.page.page}
        icon={<PiggyBank size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />}
        title={title}
        subtitle={subtitle}
        action={action}
      >
        {body}
      </FullWindow>
      {party && <GoalCelebration name={party} onDone={endParty} />}
    </>
  );
}

/** The summary at the top: everything set aside, and the next festival */
function FundsHero({ funds, money }: { funds: Fund[]; money: (n: number) => string }) {
  const { t } = useI18n();
  const saved = funds.reduce((s, f) => s + f.saved, 0);
  const target = funds.reduce((s, f) => s + f.target, 0);
  const next = funds.find(f => goalStage(f) === 'active' && !fundPlan(f).passed);
  const nextPlan = next && fundPlan(next);
  return (
    <div className="relative overflow-hidden p-6 rounded-[2rem] text-white shadow-vibrant bg-gradient-to-br from-amber-400 via-amber-500 to-indigo-600">
      <div className="relative z-10 space-y-4">
        <div>
          <p className="text-white/80 text-xs font-bold">{t('funds.heroLabel')}</p>
          <p className="text-3xl font-bold tracking-tight tabular-nums">{money(saved)}</p>
          <p className="text-white/85 text-sm font-semibold">{t('funds.heroOf', { target: money(target) })}</p>
        </div>
        <div className="h-2.5 rounded-full bg-black/20 overflow-hidden">
          <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${target ? Math.min(100, (saved / target) * 100) : 0}%` }} />
        </div>
        {next && nextPlan && (
          <p className="flex items-center gap-2 text-sm font-bold">
            <CalendarDays size={16} className="shrink-0" />
            {nextPlan.daysLeft === 0 ? t('funds.heroToday', { name: next.name }) : t('funds.heroNext', { name: next.name, days: nextPlan.daysLeft })}
          </p>
        )}
      </div>
      <PiggyBank size={120} className="absolute -right-6 -bottom-6 text-white/15" aria-hidden="true" />
    </div>
  );
}

/** One goal: a big ring, quick amounts to set aside, the weekly plan, calendar and delete */
function FundDetail({ fund, busy, money, symbol, when, accounts, onAdd, onTake, onPause, onDelete, calendar }: {
  fund: Fund;
  busy: boolean;
  money: (n: number) => string;
  symbol: string;
  when: { text: string; tone: string };
  accounts: Account[];
  onAdd: (amount: number, account: Account | null) => Promise<unknown>;
  onTake: (amount: number, account: Account | null) => Promise<unknown>;
  onPause: () => void;
  onDelete: () => void;
  calendar: React.ReactNode;
}) {
  const { t, dateLocale } = useI18n();
  const p = fundPlan(fund);
  const [other, setOther] = useState('');
  const otherValue = parseFloat(other);
  // Where the money is: '' = only set aside, or an account it moves out of (and back into)
  const [source, setSource] = useState('');
  const [takeAmount, setTakeAmount] = useState('');
  const [takeInto, setTakeInto] = useState(() => mainSource(fund) || '');
  const takeValue = parseFloat(takeAmount);
  const pick = (id: string) => accounts.find(a => a.id === id) || null;

  return (
    <>
      <div className={cn(card, 'p-6 flex flex-col items-center text-center gap-3')}>
        <ProgressRing value={p.progress} size={148} stroke={12} colorClass={ring(fund)} label={t('funds.percentLabel', { percent: Math.round(p.progress * 100) })}>
          <div>
            <p className="text-3xl font-bold tabular-nums">{Math.round(p.progress * 100)}%</p>
            {p.reached && <Check size={18} className="mx-auto text-emerald-500" />}
          </div>
        </ProgressRing>
        <p className="text-xl font-bold tabular-nums">{t('funds.detailOf', { saved: money(fund.saved), target: money(fund.target) })}</p>
        <span className={cn('inline-flex px-3 py-1 rounded-full text-xs font-bold', when.tone)}>{when.text}</span>
      </div>

      {!p.reached && !fund.paused && (
        <div className={cn(card, 'p-5 space-y-3')}>
          <p className="font-bold text-foreground">{t('funds.setAsideTitle')}</p>
          <div className="flex flex-wrap gap-2">
            {quickAmounts(fund.target).map(amount => (
              <button key={amount} disabled={busy} onClick={() => onAdd(amount, pick(source))} className="h-10 px-4 rounded-xl text-sm font-bold bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200 border border-amber-200/70 dark:border-amber-500/20 disabled:opacity-50 transition-transform active:scale-95">
                +{money(amount)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              placeholder={`${symbol} 0`}
              aria-label={t('funds.otherAmount')}
              className={inputClass}
              value={other}
              onChange={e => setOther(e.target.value)}
            />
            <button
              disabled={busy || !(otherValue > 0)}
              onClick={async () => { await onAdd(otherValue, pick(source)); setOther(''); }}
              className={cn(btnPrimary, 'shrink-0')}
            >
              {t('funds.setAside')}
            </button>
          </div>
          <MoneySource label={t('funds.fromWhere')} value={source} onChange={setSource} accounts={accounts} symbol={symbol} noneLabel={t('funds.onlySetAside')} />
        </div>
      )}

      {fund.saved > 0 && (
        <div className={cn(card, 'p-5 space-y-3')}>
          <p className="font-bold text-foreground">{t('funds.takeOutTitle')}</p>
          <div className="flex gap-2">
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              placeholder={`${symbol} 0`}
              aria-label={t('funds.takeOutAmount')}
              className={inputClass}
              value={takeAmount}
              onChange={e => setTakeAmount(e.target.value)}
            />
            <button
              disabled={busy || !(takeValue > 0) || takeValue > fund.saved}
              onClick={async () => { await onTake(takeValue, pick(takeInto)); setTakeAmount(''); }}
              className={cn(btnSecondary, 'shrink-0')}
            >
              {t('funds.takeOut')}
            </button>
          </div>
          {takeValue > fund.saved && <p className="text-xs font-semibold text-rose-500">{t('funds.takeOutTooMuch', { saved: money(fund.saved) })}</p>}
          <MoneySource label={t('funds.backInto')} value={takeInto} onChange={setTakeInto} accounts={accounts} symbol={symbol} noneLabel={t('funds.onlyRemove')} />
        </div>
      )}

      <div className={cn(card, 'p-5 space-y-3')}>
        {fund.paused ? (
          <p className="text-sm font-semibold text-muted">{t('funds.pausedNote')}</p>
        ) : p.reached ? (
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t('funds.reached', { target: money(fund.target) })}</p>
        ) : !fund.dueDate ? (
          <p className="text-sm font-semibold text-muted">{t('funds.leftToGo', { left: money(p.left) })}</p>
        ) : p.passed ? (
          <p className="text-sm font-semibold text-muted">{t('funds.passed', { date: format(new Date(fund.dueDate), 'd MMM yyyy', { locale: dateLocale }) })}</p>
        ) : (
          <>
            <p className="font-bold text-foreground">{t('funds.planTitle')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat value={money(p.perWeek)} label={t('funds.perWeek')} />
              <Stat value={money(p.perMonth)} label={t('funds.perMonth')} />
            </div>
            <p className="text-xs text-muted font-medium">{t('funds.leftToGo', { left: money(p.left) })}</p>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {calendar}
        {(fund.paused || !p.reached) && (
          <button onClick={onPause} disabled={busy} className={cn(btnSecondary, 'h-10')}>
            {fund.paused ? <Play size={16} /> : <Pause size={16} />} {t(fund.paused ? 'funds.resume' : 'funds.pause')}
          </button>
        )}
        <button onClick={onDelete} disabled={busy} className={cn(btnSecondary, 'h-10 text-rose-600 dark:text-rose-400')}>
          <Trash2 size={16} /> {t('funds.deleteFund')}
        </button>
      </div>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-3 rounded-2xl bg-background/50 border border-card-border">
      <p className="text-lg font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted font-semibold">{label}</p>
    </div>
  );
}

/** A new goal in three short steps: which occasion, how much, and when */
function NewFund({ busy, symbol, onCreate }: { busy: boolean; symbol: string; onCreate: (name: string, target: number, date: string | null) => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [preset, setPreset] = useState<string>('eidFitr');
  const [custom, setCustom] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState(format(addMonths(new Date(), 3), 'yyyy-MM-dd'));
  const [noDate, setNoDate] = useState(false);
  const name = preset === 'custom' ? custom.trim() : t(PRESET_TEXT[preset as Festival | GoalIdea]);
  const value = parseFloat(target);
  const ready = [!!name, value > 0, !!date][step - 1];

  return (
    <div className="space-y-5">
      <Steps step={step} total={3} />

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-lg font-bold">{t('funds.which')}</p>
          <div className="grid grid-cols-2 gap-2">
            {[...FESTIVALS, ...GOAL_IDEAS, 'custom' as const].map(f => (
              <button
                key={f}
                onClick={() => setPreset(f)}
                aria-pressed={preset === f}
                className={cn(
                  'h-14 px-3 rounded-2xl text-sm font-bold border transition-colors text-left',
                  f === 'custom' && 'col-span-2',
                  preset === f ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-card text-foreground border-card-border hover:border-amber-500/40',
                )}
              >
                {f === 'custom' ? t('funds.custom') : t(PRESET_TEXT[f])}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <input autoFocus maxLength={60} placeholder={t('funds.customPlaceholder')} aria-label={t('funds.custom')} className={inputClass} value={custom} onChange={e => setCustom(e.target.value)} />
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-lg font-bold">{t('funds.stepGoal', { name })}</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted">{symbol}</span>
            <input
              autoFocus type="number" min="0" step="0.01" inputMode="decimal"
              aria-label={t('funds.target', { symbol })}
              className={cn(inputClass, 'h-16 pl-12 text-2xl font-bold')}
              value={target}
              onChange={e => setTarget(e.target.value)}
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-lg font-bold">{t('funds.stepDate', { name })}</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={noDate} onChange={e => setNoDate(e.target.checked)} />
            <span className="text-sm font-semibold text-foreground">{t('funds.noDateOption')}</span>
          </label>
          {!noDate && (
            <div>
              <span className={labelClass}>{t('funds.date')}</span>
              <DateField value={date} onChange={setDate} ariaLabel={t('funds.date')} />
            </div>
          )}
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-sm font-semibold text-amber-800 dark:text-amber-200">
            {t('funds.review', { name, target: `${symbol}${value.toLocaleString()}` })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {step > 1 && <button onClick={() => setStep(s => s - 1)} className={cn(btnSecondary, 'flex-1')}>{t('common.back')}</button>}
        {step < 3
          ? <button disabled={!ready} onClick={() => setStep(s => s + 1)} className={cn(btnPrimary, 'flex-1')}>{t('common.next')}</button>
          : <button disabled={busy || !ready} onClick={() => onCreate(name, value, noDate ? null : date)} className={cn(btnPrimary, 'flex-1')}>{t('funds.create')}</button>}
      </div>
    </div>
  );
}

/** "Where is this money?": only set aside, or one of the accounts */
function MoneySource({ label, value, onChange, accounts, symbol, noneLabel }: {
  label: string; value: string; onChange: (id: string) => void; accounts: Account[]; symbol: string; noneLabel: string;
}) {
  if (accounts.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-muted">{label}</p>
      <button type="button" onClick={() => onChange('')} aria-pressed={!value}
        className={cn('px-3 py-2 rounded-xl text-xs font-bold border', !value ? 'bg-amber-500 text-white border-amber-500' : 'bg-background/50 text-muted border-card-border')}>
        {noneLabel}
      </button>
      <AccountPicker accounts={accounts} value={value} onChange={onChange} symbol={symbol} includeCash={false} compact />
    </div>
  );
}

/** "Step 2 of 3" with a bar per step */
export function Steps({ step, total }: { step: number; total: number }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-muted">{t('common.stepOf', { n: step, total })}</p>
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i < step ? 'bg-indigo-600' : 'bg-card-border')} />
        ))}
      </div>
    </div>
  );
}

/** A friendly empty page with one button */
export function EmptyState({ title, text, button }: { title: string; text: string; button: React.ReactNode }) {
  return (
    <div className={cn(card, 'p-8 text-center space-y-3')}>
      <p className="text-lg font-bold text-foreground">{title}</p>
      <p className="text-sm text-muted font-medium leading-relaxed">{text}</p>
      <div className="pt-2">{button}</div>
    </div>
  );
}
