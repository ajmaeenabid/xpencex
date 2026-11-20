import { useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Check, ChevronRight, Gift, Plus, Trash2, Users, Wallet } from 'lucide-react';
import { Account } from '../../shared/types';
import { useAuth } from '../../app/App';
import { useI18n, TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import FullWindow, { usePages } from '../../shared/components/FullWindow';
import ProgressRing from '../../shared/components/ProgressRing';
import DateField from '../../shared/components/DateField';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import AccountPicker from '../accounts/AccountPicker';
import { btnPrimary, btnSecondary, btnSmall, card, inputClass, labelClass } from '../accounts/ui';
import SheetsExportButton from '../connect/SheetsExportButton';
import AddToCalendarButton from '../connect/AddToCalendarButton';
import { samityTabs } from '../connect/exportTables';
import { EmptyState, Steps } from '../funds/FundsWindow';
import { Samity, payoutAmount, roundDate, samityStatus } from './samity';
import { createSamity, deleteSamity, payRound, receivePayout, undoPayout, undoRound } from './samityService';
import { CHOICE_ON } from '../../shared/lib/choice';

type Page = { page: 'list' } | { page: 'samity'; id: string } | { page: 'new' };

/** The full Samity window: all samities, one samity's rounds, and a new samity in three steps */
export default function SamityWindow({ open, onClose, uid, list, accounts, symbol }: {
  open: boolean;
  onClose: () => void;
  uid: string;
  list: Samity[]; // unfinished first
  accounts: Account[];
  symbol: string;
}) {
  const { t, dateLocale } = useI18n();
  const { profile } = useAuth();
  const nav = usePages<Page>({ page: 'list' });
  const [busy, setBusy] = useState(false);
  // Pay from and receive into an account, or only record the rounds
  const [moveMoney, setMoveMoney] = useState(accounts.length > 0);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const account = moveMoney ? accounts.find(a => a.id === accountId) : undefined;
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const day = (d: Date) => format(d, 'd MMM yyyy', { locale: dateLocale });
  const close = () => { onClose(); nav.reset(); };

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); return true; }
    catch (err) { console.error('Samity change failed:', err); alertDialog(t('samity.error')); return false; }
    finally { setBusy(false); }
  };

  let title = t('samity.title');
  let subtitle: string | undefined;
  let body: React.ReactNode;
  let action: React.ReactNode = null;

  if (nav.page.page === 'list') {
    subtitle = list.length ? t('samity.count', { count: list.length }) : undefined;
    action = list.length > 0 && (
      <button onClick={() => nav.go({ page: 'new' })} className={cn(btnSmall, 'bg-indigo-600 text-white hover:bg-indigo-700')}>
        <Plus size={15} /> {t('samity.newShort')}
      </button>
    );
    body = list.length === 0 ? (
      <EmptyState
        title={t('samity.emptyTitle')}
        text={t('samity.emptyBody')}
        button={<button onClick={() => nav.go({ page: 'new' })} className={btnPrimary}><Plus size={16} /> {t('samity.new')}</button>}
      />
    ) : (
      <>
        <SamityHero list={list} money={money} day={day} />
        <div className="space-y-3">
          {list.map(s => {
            const st = samityStatus(s);
            return (
              <button key={s.id} onClick={() => nav.go({ page: 'samity', id: s.id })} className={cn(card, 'w-full p-4 flex items-center gap-4 text-left transition-colors hover:border-indigo-500/40')}>
                <ProgressRing value={st.paidCount / s.members} colorClass={st.finished ? 'text-emerald-500' : 'text-indigo-600'} label={t('samity.paidOf', { paid: st.paidCount, members: s.members, amount: money(s.amount) })}>
                  <span className="text-xs font-bold tabular-nums">{st.paidCount}/{s.members}</span>
                </ProgressRing>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-bold text-foreground truncate">{s.name}</p>
                  <p className="text-sm text-muted font-semibold truncate">
                    {st.finished ? t('samity.finishedShort') : st.nextUnpaid ? t('samity.nextShort', { amount: money(s.amount), date: day(st.nextUnpaid.date) }) : t('samity.allPaid')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {st.overdue > 0 && <Chip tone="danger">{t('samity.chipLate', { count: st.overdue })}</Chip>}
                    {!s.payout && <Chip tone="info">{t('samity.chipPot', { n: s.myTurn })}</Chip>}
                    {st.finished && <Chip tone="good">{t('samity.chipDone')}</Chip>}
                  </div>
                </div>
                <ChevronRight size={20} className="text-muted shrink-0" />
              </button>
            );
          })}
        </div>
        <SheetsExportButton
          variant="wide"
          className="w-full"
          build={() => ({
            title: t('sheets.titleSamity', { date: format(new Date(), 'd MMM yyyy', { locale: dateLocale }) }),
            tabs: samityTabs(list, profile?.currency || 'BDT', t),
          })}
        />
      </>
    );
  } else if (nav.page.page === 'samity') {
    const id = nav.page.id;
    const s = list.find(x => x.id === id);
    if (s) {
      const st = samityStatus(s);
      title = s.name;
      subtitle = t('samity.detailLine', { amount: money(s.amount), how: t(s.frequency === 'weekly' ? 'samity.weekly' : 'samity.monthly'), members: s.members });
      const today = new Date(); today.setHours(23, 59, 59, 999);

      body = (
        <>
          {/* Progress and your pot */}
          <div className={cn(card, 'p-5 flex items-center gap-5')}>
            <ProgressRing value={st.paidCount / s.members} size={96} stroke={9} colorClass={st.finished ? 'text-emerald-500' : 'text-indigo-600'} label={t('samity.paidOf', { paid: st.paidCount, members: s.members, amount: money(s.amount) })}>
              <div className="text-center">
                <p className="text-xl font-bold tabular-nums leading-none">{st.paidCount}/{s.members}</p>
                <p className="text-[11px] text-muted font-bold mt-1">{t('samity.roundsWord')}</p>
              </div>
            </ProgressRing>
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted font-bold">{t('samity.potTitle')}</p>
              <p className="text-2xl font-bold tabular-nums">{money(payoutAmount(s))}</p>
              <p className="text-sm text-muted font-semibold">{t('samity.potLine', { n: s.myTurn, date: day(st.myTurnDate) })}</p>
              {s.payout
                ? <Chip tone="good"><Check size={12} /> {t('samity.gotPot')}</Chip>
                : (
                  <button disabled={busy} onClick={() => act(() => receivePayout(s, account))} className={cn(btnSmall, 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50')}>
                    <Gift size={14} /> {t('samity.markReceived')}
                  </button>
                )}
              {s.payout && (
                <button disabled={busy} onClick={() => act(() => undoPayout(s, accounts))} className="block text-xs font-bold text-muted underline disabled:opacity-50">{t('samity.undoReceived')}</button>
              )}
            </div>
          </div>

          {st.overdue > 0 && (
            <p className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-sm font-semibold text-rose-700 dark:text-rose-300">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {t('samity.overdue', { count: st.overdue })}
            </p>
          )}

          {/* Which account the money moves through */}
          <div className={cn(card, 'p-4 space-y-3')}>
            <p className="flex items-center gap-2 font-bold text-foreground"><Wallet size={16} className="text-indigo-600 dark:text-indigo-400" /> {t('samity.moneyTitle')}</p>
            {accounts.length > 0 ? (
              <>
                <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={moveMoney} onChange={e => setMoveMoney(e.target.checked)} />
                  {t('samity.useAccount')}
                </label>
                {moveMoney && <AccountPicker compact includeCash={false} accounts={accounts} value={accountId} onChange={setAccountId} symbol={symbol} />}
              </>
            ) : (
              <p className="text-xs text-muted font-medium">{t('samity.noAccounts')}</p>
            )}
          </div>

          {/* Calendar reminders */}
          {(st.nextUnpaid || (!s.payout && st.myTurnDate.getTime() >= Date.now() - 86_400_000)) && (
            <div className="flex flex-wrap gap-2">
              {st.nextUnpaid && (
                <AddToCalendarButton
                  className="h-10 px-4 text-sm"
                  label={t('calendar.samityPayButton')}
                  event={{
                    title: t('calendar.samityPayTitle', { name: s.name, amount: money(s.amount) }),
                    date: st.nextUnpaid.date,
                    details: t('calendar.samityPayDetails', { members: s.members }),
                    repeat: { every: s.frequency === 'weekly' ? 'week' : 'month', times: s.members - st.nextUnpaid.n + 1 },
                  }}
                />
              )}
              {!s.payout && st.myTurnDate.getTime() >= Date.now() - 86_400_000 && (
                <AddToCalendarButton
                  className="h-10 px-4 text-sm"
                  label={t('calendar.samityPayoutButton')}
                  event={{
                    title: t('calendar.samityPayoutTitle', { name: s.name, pot: money(payoutAmount(s)) }),
                    date: st.myTurnDate,
                    details: t('calendar.samityPayoutDetails', { n: s.myTurn, members: s.members }),
                  }}
                />
              )}
            </div>
          )}

          {/* Timeline of rounds */}
          <div className={cn(card, 'p-4')}>
            <p className="font-bold text-foreground mb-2">{t('samity.roundsTitle')}</p>
            <ol>
              {st.rounds.map((r, i) => {
                const late = !r.paid && r.date.getTime() <= today.getTime();
                const status = r.paid ? 'paid' : late ? 'late' : 'upcoming';
                return (
                  <li key={r.n} className="relative flex items-center gap-3 py-2.5">
                    {/* The line joining the dots */}
                    {i < st.rounds.length - 1 && <span className="absolute left-[15px] top-9 bottom-[-10px] w-0.5 bg-card-border" aria-hidden="true" />}
                    <span className={cn(
                      'relative z-10 w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold',
                      r.paid ? 'bg-indigo-600 text-white' : late ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-background border border-card-border text-muted',
                      r.mine && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[var(--card-solid)]',
                    )}>
                      {r.paid ? <Check size={14} /> : r.n}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">
                        {t('samity.roundN', { n: r.n })}
                        {r.mine && <span className="ml-2 text-[12px] font-bold text-amber-600 dark:text-amber-400">{t('samity.yourTurnLabel')}</span>}
                      </p>
                      <p className="text-xs text-muted font-medium">{day(r.date)} · {t(`samity.status.${status}` as TKey)}</p>
                    </div>
                    {r.paid
                      ? <button disabled={busy} onClick={() => act(() => undoRound(s, r.n, accounts))} aria-label={t('samity.undo', { n: r.n })} className={cn(btnSmall, 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 disabled:opacity-50')}><Check size={13} /> {t('samity.paid')}</button>
                      : <button disabled={busy} onClick={() => act(() => payRound(s, r.n, account))} className={cn(btnSmall, late ? 'bg-rose-600 text-white' : 'bg-card text-foreground border border-card-border', 'disabled:opacity-50')}>{t('samity.markPaid')}</button>}
                  </li>
                );
              })}
            </ol>
          </div>

          <button
            disabled={busy}
            onClick={async () => {
              if (!(await confirmDialog(t('samity.confirmDelete', { name: s.name }), { danger: true }))) return;
              if (await act(() => deleteSamity(s))) nav.back();
            }}
            className={cn(btnSecondary, 'h-10 text-rose-600 dark:text-rose-400')}
          >
            <Trash2 size={16} /> {t('samity.deleteSamity')}
          </button>
        </>
      );
    } else {
      body = <p className="text-center py-16 text-sm text-muted font-medium">{t('samity.gone')}</p>;
    }
  } else {
    title = t('samity.new');
    body = (
      <NewSamity
        busy={busy}
        symbol={symbol}
        money={money}
        day={day}
        onCreate={async data => {
          if (await act(() => createSamity({ uid, ...data }))) nav.back();
        }}
      />
    );
  }

  return (
    <FullWindow
      open={open}
      atRoot={nav.atRoot}
      onClose={close}
      onBack={nav.back}
      pageKey={nav.depth + nav.page.page}
      icon={<Users size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />}
      title={title}
      subtitle={subtitle}
      action={action}
    >
      {body}
    </FullWindow>
  );
}

function Chip({ tone, children }: { tone: 'danger' | 'info' | 'good'; children: React.ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-bold',
      tone === 'danger' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
        : tone === 'good' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    )}>
      {children}
    </span>
  );
}

/** The summary at the top: the next payment across all samities, and your next pot */
function SamityHero({ list, money, day }: { list: Samity[]; money: (n: number) => string; day: (d: Date) => string }) {
  const { t } = useI18n();
  const due = list
    .map(s => ({ s, next: samityStatus(s).nextUnpaid }))
    .filter((x): x is { s: Samity; next: { n: number; date: Date } } => !!x.next)
    .sort((a, b) => a.next.date.getTime() - b.next.date.getTime())[0];
  const pot = list
    .filter(s => !s.payout)
    .map(s => ({ s, date: samityStatus(s).myTurnDate }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  const late = list.reduce((sum, s) => sum + samityStatus(s).overdue, 0);

  return (
    <div className="relative overflow-hidden p-6 rounded-[2rem] text-white shadow-vibrant bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600">
      <div className="relative z-10 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-white/80 text-xs font-bold">{t('samity.heroNextPay')}</p>
          {due ? (
            <>
              <p className="text-2xl font-bold tabular-nums">{money(due.s.amount)}</p>
              <p className="text-white/85 text-xs font-semibold truncate">{due.s.name} · {day(due.next.date)}</p>
            </>
          ) : <p className="text-sm font-bold mt-1">{t('samity.heroNoneDue')}</p>}
        </div>
        <div className="min-w-0">
          <p className="text-white/80 text-xs font-bold">{t('samity.heroPot')}</p>
          {pot ? (
            <>
              <p className="text-2xl font-bold tabular-nums">{money(payoutAmount(pot.s))}</p>
              <p className="text-white/85 text-xs font-semibold truncate">{pot.s.name} · {day(pot.date)}</p>
            </>
          ) : <p className="text-sm font-bold mt-1">{t('samity.heroNoPot')}</p>}
        </div>
      </div>
      {late > 0 && (
        <p className="relative z-10 mt-4 flex items-center gap-2 text-sm font-bold">
          <AlertTriangle size={16} className="shrink-0" /> {t('samity.overdue', { count: late })}
        </p>
      )}
      <Users size={120} className="absolute -right-6 -bottom-6 text-white/15" aria-hidden="true" />
    </div>
  );
}

/** A new samity in three steps: the basics, members and your turn, and the start date */
function NewSamity({ busy, symbol, money, day, onCreate }: {
  busy: boolean;
  symbol: string;
  money: (n: number) => string;
  day: (d: Date) => string;
  onCreate: (data: Pick<Samity, 'name' | 'amount' | 'frequency' | 'members' | 'myTurn' | 'startDate'>) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Samity['frequency']>('monthly');
  const [members, setMembers] = useState('');
  const [myTurn, setMyTurn] = useState('');
  const [start, setStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const value = parseFloat(amount), count = parseInt(members, 10), turn = parseInt(myTurn, 10);
  const turnOk = count >= 2 && count <= 100 && turn >= 1 && turn <= count;
  const ready = [!!name.trim() && value > 0, turnOk, !!start][step - 1];
  const startDate = new Date(`${start}T12:00:00`);
  const turnDate = turnOk ? roundDate({ startDate: startDate.toISOString(), frequency }, turn) : null;

  return (
    <div className="space-y-5">
      <Steps step={step} total={3} />

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-lg font-bold">{t('samity.stepBasics')}</p>
          <div>
            <label className={labelClass} htmlFor="sam-name">{t('samity.name')}</label>
            <input id="sam-name" autoFocus maxLength={60} className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder={t('samity.namePlaceholder')} />
          </div>
          <div>
            <label className={labelClass} htmlFor="sam-amount">{t('samity.amount', { symbol })}</label>
            <input id="sam-amount" type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <span className={labelClass}>{t('samity.how')}</span>
            <div className="grid grid-cols-2 gap-2">
              {(['monthly', 'weekly'] as const).map(f => (
                <button key={f} onClick={() => setFrequency(f)} aria-pressed={frequency === f} className={cn(
                  'h-12 rounded-xl text-sm font-bold border transition-colors',
                  frequency === f ? CHOICE_ON : 'bg-card text-foreground border-card-border',
                )}>
                  {t(f === 'weekly' ? 'samity.weekly' : 'samity.monthly')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-lg font-bold">{t('samity.stepTurn')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="sam-members">{t('samity.members')}</label>
              <input id="sam-members" autoFocus type="number" min="2" max="100" inputMode="numeric" className={inputClass} value={members} onChange={e => setMembers(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="sam-turn">{t('samity.myTurn')}</label>
              <input id="sam-turn" type="number" min="1" inputMode="numeric" className={inputClass} value={myTurn} onChange={e => setMyTurn(e.target.value)} />
            </div>
          </div>
          {members && myTurn && !turnOk && <p className="text-xs font-semibold text-rose-500">{t('samity.turnError')}</p>}
          {turnOk && value > 0 && (
            <p className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-sm font-semibold text-indigo-800 dark:text-indigo-200">
              {t('samity.previewPot', { pot: money(Math.round(value * count * 100) / 100), n: turn })}
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-lg font-bold">{t('samity.stepStart')}</p>
          <div>
            <span className={labelClass}>{t('samity.start')}</span>
            <DateField value={start} onChange={setStart} ariaLabel={t('samity.start')} />
          </div>
          {turnDate && (
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-sm font-semibold text-indigo-800 dark:text-indigo-200 space-y-1">
              <p>{t('samity.reviewPay', { amount: money(value), how: t(frequency === 'weekly' ? 'samity.weekly' : 'samity.monthly').toLowerCase(), members: count })}</p>
              <p>{t('samity.reviewPot', { pot: money(Math.round(value * count * 100) / 100), date: day(turnDate) })}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {step > 1 && <button onClick={() => setStep(s => s - 1)} className={cn(btnSecondary, 'flex-1')}>{t('common.back')}</button>}
        {step < 3
          ? <button disabled={!ready} onClick={() => setStep(s => s + 1)} className={cn(btnPrimary, 'flex-1')}>{t('common.next')}</button>
          : <button
              disabled={busy || !ready}
              onClick={() => onCreate({ name: name.trim().slice(0, 60), amount: Math.round(value * 100) / 100, frequency, members: count, myTurn: turn, startDate: startDate.toISOString() })}
              className={cn(btnPrimary, 'flex-1')}
            >
              {t('samity.create')}
            </button>}
      </div>
    </div>
  );
}
