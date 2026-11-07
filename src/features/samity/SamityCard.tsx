import { useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronDown, Plus, Trash2, Users } from 'lucide-react';
import { Account } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import Select from '../../shared/components/Select';
import DateField from '../../shared/components/DateField';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import AccountPicker from '../accounts/AccountPicker';
import { Samity, payoutAmount, samityStatus } from './samity';
import { createSamity, deleteSamity, payRound, receivePayout, undoPayout, undoRound, useSamities } from './samityService';

const field = 'w-full h-11 px-3 rounded-xl bg-background/60 border border-card-border text-sm text-foreground outline-none focus:border-indigo-500';
const btn = 'h-9 px-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-50';
const label = 'block text-xs font-semibold text-muted mb-1.5';

/** Home card for your samities: the next round to pay and your payout turn; tap to tick rounds */
export default function SamityCard({ uid, accounts, symbol }: { uid: string; accounts: Account[]; symbol: string }) {
  const { t, dateLocale } = useI18n();
  const all = useSamities(uid);
  const list = [...all].sort((a, b) => Number(samityStatus(a).finished) - Number(samityStatus(b).finished) || a.createdAt.localeCompare(b.createdAt));
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [moveMoney, setMoveMoney] = useState(accounts.length > 0);
  const [form, setForm] = useState({ name: '', amount: '', frequency: 'monthly', members: '', myTurn: '', start: format(new Date(), 'yyyy-MM-dd') });
  const [busy, setBusy] = useState(false);
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;
  const day = (d: Date) => format(d, 'd MMM yyyy', { locale: dateLocale });
  const account = moveMoney ? accounts.find(a => a.id === accountId) : undefined;
  const first = list[0];

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); return true; }
    catch (err) { console.error('Samity change failed:', err); alertDialog(t('samity.error')); return false; }
    finally { setBusy(false); }
  };

  const members = parseInt(form.members, 10), myTurn = parseInt(form.myTurn, 10), amount = parseFloat(form.amount);
  const formOk = form.name.trim() && amount > 0 && members >= 2 && members <= 100 && myTurn >= 1 && myTurn <= members;
  const create = async () => {
    if (!formOk) return;
    const ok = await act(() => createSamity({
      uid, name: form.name.trim().slice(0, 60), amount: Math.round(amount * 100) / 100, frequency: form.frequency as Samity['frequency'],
      members, myTurn, startDate: new Date(`${form.start}T12:00:00`).toISOString(),
    }));
    if (ok) { setAdding(false); setForm(f => ({ ...f, name: '', amount: '', members: '', myTurn: '' })); }
  };

  const summary = (s: Samity) => {
    const st = samityStatus(s);
    if (st.finished) return t('samity.finished');
    const next = st.nextUnpaid ? t('samity.next', { n: st.nextUnpaid.n, members: s.members, amount: money(s.amount), date: day(st.nextUnpaid.date) }) : t('samity.allPaid');
    const payout = s.payout ? t('samity.payoutReceived') : t('samity.payoutOn', { pot: money(payoutAmount(s)), n: s.myTurn, date: day(st.myTurnDate) });
    return `${next} ${payout}`;
  };

  return (
    <div className="p-5 bg-card rounded-[2rem] shadow-soft border border-card-border space-y-3">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-3 text-left">
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400"><Users size={20} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-muted text-xs font-bold">{t('samity.title')}</p>
          <p className="font-bold text-sm text-foreground truncate">{first ? first.name : t('samity.empty')}</p>
        </div>
        <ChevronDown size={18} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {first && !open && (
        <p className="text-xs text-muted font-medium leading-relaxed">
          {summary(first)}
          {samityStatus(first).overdue > 0 && <span className="text-rose-500 font-semibold"> {t('samity.overdue', { count: samityStatus(first).overdue })}</span>}
        </p>
      )}

      {open && (
        <div className="space-y-3">
          {accounts.length > 0 ? (
            <div className="p-3 rounded-xl bg-background/50 space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={moveMoney} onChange={(e) => setMoveMoney(e.target.checked)} />
                {t('samity.useAccount')}
              </label>
              {moveMoney && <AccountPicker compact includeCash={false} accounts={accounts} value={accountId} onChange={setAccountId} symbol={symbol} />}
            </div>
          ) : (
            <p className="text-[11px] text-muted font-medium">{t('samity.noAccounts')}</p>
          )}

          {list.map(s => {
            const st = samityStatus(s);
            return (
              <div key={s.id} className="p-3 rounded-xl bg-background/50 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{s.name}</p>
                    <p className="text-[11px] text-muted font-medium">{t('samity.paidOf', { paid: st.paidCount, members: s.members, amount: money(s.amount) })}</p>
                  </div>
                  <button
                    onClick={async () => { if (await confirmDialog(t('samity.confirmDelete', { name: s.name }), { danger: true })) act(() => deleteSamity(s)); }}
                    aria-label={t('samity.delete', { name: s.name })}
                    className="p-1.5 rounded-lg text-muted hover:text-rose-500"
                  ><Trash2 size={15} /></button>
                </div>
                <ul className="divide-y divide-card-border">
                  {st.rounds.map(r => (
                    <li key={r.n} className="flex items-center justify-between gap-2 py-2">
                      <span className={cn('text-xs font-semibold', r.mine ? 'text-indigo-600 dark:text-indigo-400' : 'text-foreground')}>
                        {t('samity.round', { n: r.n, date: day(r.date) })}{r.mine && ` · ${t('samity.yourTurn')}`}
                      </span>
                      <span className="flex gap-1.5">
                        {r.mine && (
                          s.payout
                            ? <button disabled={busy} onClick={() => act(() => undoPayout(s, accounts))} className={cn(btn, 'bg-teal-600 text-white')}><Check size={12} className="inline" /> {t('samity.gotPot')}</button>
                            : <button disabled={busy} onClick={() => act(() => receivePayout(s, account))} className={cn(btn, 'border border-card-border text-foreground')}>{t('samity.getPot', { pot: money(payoutAmount(s)) })}</button>
                        )}
                        {r.paid
                          ? <button disabled={busy} onClick={() => act(() => undoRound(s, r.n, accounts))} aria-label={t('samity.undo', { n: r.n })} className={cn(btn, 'bg-indigo-600 text-white')}><Check size={12} className="inline" /> {t('samity.paid')}</button>
                          : <button disabled={busy} onClick={() => act(() => payRound(s, r.n, account))} className={cn(btn, 'border border-card-border text-foreground')}>{t('samity.pay')}</button>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {adding ? (
            <div className="p-3 rounded-xl bg-background/50 space-y-3">
              <div><label className={label} htmlFor="sam-name">{t('samity.name')}</label><input id="sam-name" maxLength={60} className={field} value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('samity.namePlaceholder')} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label} htmlFor="sam-amount">{t('samity.amount', { symbol })}</label><input id="sam-amount" type="number" min="0" step="0.01" inputMode="decimal" className={field} value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
                <div><span className={label}>{t('samity.how')}</span><Select value={form.frequency} onChange={(v) => setForm(f => ({ ...f, frequency: v }))} ariaLabel={t('samity.how')} options={[{ value: 'monthly', label: t('samity.monthly') }, { value: 'weekly', label: t('samity.weekly') }]} /></div>
                <div><label className={label} htmlFor="sam-members">{t('samity.members')}</label><input id="sam-members" type="number" min="2" max="100" inputMode="numeric" className={field} value={form.members} onChange={(e) => setForm(f => ({ ...f, members: e.target.value }))} /></div>
                <div><label className={label} htmlFor="sam-turn">{t('samity.myTurn')}</label><input id="sam-turn" type="number" min="1" inputMode="numeric" className={field} value={form.myTurn} onChange={(e) => setForm(f => ({ ...f, myTurn: e.target.value }))} /></div>
              </div>
              <div><span className={label}>{t('samity.start')}</span><DateField value={form.start} onChange={(v) => setForm(f => ({ ...f, start: v }))} ariaLabel={t('samity.start')} /></div>
              {form.members && form.myTurn && !formOk && amount > 0 && form.name.trim() && <p className="text-xs font-semibold text-rose-500">{t('samity.turnError')}</p>}
              <div className="flex gap-2">
                <button onClick={() => setAdding(false)} className={cn(btn, 'flex-1 h-10 bg-background/60 text-muted border border-card-border')}>{t('common.cancel')}</button>
                <button disabled={busy || !formOk} onClick={create} className={cn(btn, 'flex-1 h-10 bg-indigo-600 text-white')}>{t('samity.create')}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 dark:text-indigo-400"><Plus size={16} /> {t('samity.new')}</button>
          )}
        </div>
      )}
    </div>
  );
}

