import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, increment, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { addMonths, format } from 'date-fns';
import { ChevronDown, PartyPopper, Plus, Trash2 } from 'lucide-react';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { cn } from '../../shared/lib/utils';
import { useI18n, TKey } from '../../shared/i18n';
import Select from '../../shared/components/Select';
import DateField from '../../shared/components/DateField';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import { FESTIVALS, Festival, Fund, fundPlan, sortFunds } from './funds';
import { CARD_SUB, CARD_TITLE } from '../../shared/lib/cardText';

const FESTIVAL_TEXT: Record<Festival, TKey> = {
  eidFitr: 'funds.eidFitr',
  eidAdha: 'funds.eidAdha',
  durgaPuja: 'funds.durgaPuja',
  boishakh: 'funds.boishakh',
  christmas: 'funds.christmas',
  buddhaPurnima: 'funds.buddhaPurnima',
};
const field = 'w-full h-11 px-3 rounded-xl bg-background/60 border border-card-border text-sm text-foreground outline-none focus:border-indigo-500';
const btn = 'h-10 px-4 rounded-xl text-sm font-bold transition-colors disabled:opacity-50';

function useFunds(uid: string) {
  const [funds, setFunds] = useState<Fund[]>([]);
  useEffect(() => onSnapshot(query(collection(db, 'funds'), where('uid', '==', uid)), snap => setFunds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Fund)))), [uid]);
  return funds;
}

/** Home card: the nearest festival fund; tap to see all funds, set money aside, or start a new one */
export default function FundsCard({ uid, symbol }: { uid: string; symbol: string }) {
  const { t, dateLocale } = useI18n();
  const funds = sortFunds(useFunds(uid));
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState<string>('eidFitr');
  const [custom, setCustom] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState(format(addMonths(new Date(), 3), 'yyyy-MM-dd'));
  const [aside, setAside] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;
  const day = (iso: string) => format(new Date(iso), 'd MMM yyyy', { locale: dateLocale });
  const nearest = funds[0];

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); return true; }
    catch (err) { console.error('Festival fund change failed:', err); alertDialog(t('funds.error')); return false; }
    finally { setBusy(false); }
  };

  const create = async () => {
    const name = (preset === 'custom' ? custom : t(FESTIVAL_TEXT[preset as Festival])).trim().slice(0, 60);
    const value = parseFloat(target);
    if (!name || !Number.isFinite(value) || value <= 0) return;
    const ok = await act(() => saved(addDoc(collection(db, 'funds'), {
      uid, name, target: Math.round(value * 100) / 100, dueDate: new Date(`${date}T12:00:00`).toISOString(), saved: 0, createdAt: new Date().toISOString(),
    })));
    if (ok) { setAdding(false); setTarget(''); setCustom(''); }
  };

  const addAside = async (fund: Fund) => {
    const value = parseFloat(aside[fund.id] || '');
    if (!Number.isFinite(value) || value <= 0) return;
    if (await act(() => saved(updateDoc(doc(db, 'funds', fund.id), { saved: increment(Math.round(value * 100) / 100) })))) {
      setAside(prev => ({ ...prev, [fund.id]: '' }));
    }
  };

  const remove = async (fund: Fund) => {
    if (await confirmDialog(t('funds.confirmDelete', { name: fund.name }), { danger: true })) act(() => saved(deleteDoc(doc(db, 'funds', fund.id))));
  };

  const line = (fund: Fund) => {
    const p = fundPlan(fund);
    if (p.reached) return t('funds.reached', { target: money(fund.target) });
    if (p.passed) return t('funds.passed', { date: day(fund.dueDate) });
    return t('funds.plan', { perWeek: money(p.perWeek), perMonth: money(p.perMonth), target: money(fund.target), date: day(fund.dueDate) });
  };

  return (
    <div className="p-5 bg-card rounded-[2rem] shadow-soft border border-card-border space-y-3">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-3 text-left">
        <div className="w-10 h-10 shrink-0 bg-amber-50 dark:bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-700 dark:text-amber-400">
          <PartyPopper size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={CARD_TITLE}>{t('funds.title')}</p>
          <p className={CARD_SUB}>
            {nearest ? t('funds.progress', { name: nearest.name, saved: money(nearest.saved), target: money(nearest.target) }) : t('funds.empty')}
          </p>
        </div>
        <ChevronDown size={18} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {nearest && !open && (
        <>
          <div className="h-2 rounded-full bg-background/60 overflow-hidden">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.round(fundPlan(nearest).progress * 100)}%` }} />
          </div>
          <p className="text-xs text-muted font-medium leading-relaxed">{line(nearest)}</p>
        </>
      )}

      {open && (
        <div className="space-y-3">
          {funds.map(fund => (
            <div key={fund.id} className="p-3 rounded-xl bg-background/50 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{fund.name}</p>
                  <p className="text-[11px] text-muted font-medium">{t('funds.progress', { name: day(fund.dueDate), saved: money(fund.saved), target: money(fund.target) })}</p>
                </div>
                <button onClick={() => remove(fund)} aria-label={t('funds.delete', { name: fund.name })} className="p-1.5 rounded-lg text-muted hover:text-rose-500"><Trash2 size={15} /></button>
              </div>
              <div className="h-2 rounded-full bg-card overflow-hidden">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.round(fundPlan(fund).progress * 100)}%` }} />
              </div>
              <p className="text-xs text-muted font-medium leading-relaxed">{line(fund)}</p>
              <div className="flex gap-2">
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder={`${symbol} 0`} aria-label={t('funds.setAside')} className={field} value={aside[fund.id] || ''} onChange={(e) => setAside(prev => ({ ...prev, [fund.id]: e.target.value }))} />
                <button disabled={busy} onClick={() => addAside(fund)} className={cn(btn, 'shrink-0 bg-indigo-600 text-white')}>{t('funds.setAside')}</button>
              </div>
            </div>
          ))}

          {adding ? (
            <div className="p-3 rounded-xl bg-background/50 space-y-3">
              <Select value={preset} onChange={setPreset} ariaLabel={t('funds.which')} options={[...FESTIVALS.map(f => ({ value: f, label: t(FESTIVAL_TEXT[f]) })), { value: 'custom', label: t('funds.custom') }]} />
              {preset === 'custom' && <input maxLength={60} placeholder={t('funds.customPlaceholder')} aria-label={t('funds.custom')} className={field} value={custom} onChange={(e) => setCustom(e.target.value)} />}
              <input type="number" min="0" step="0.01" inputMode="decimal" placeholder={t('funds.target', { symbol })} aria-label={t('funds.target', { symbol })} className={field} value={target} onChange={(e) => setTarget(e.target.value)} />
              <div>
                <p className="text-xs font-semibold text-muted mb-1.5">{t('funds.date')}</p>
                <DateField value={date} onChange={setDate} ariaLabel={t('funds.date')} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAdding(false)} className={cn(btn, 'flex-1 bg-background/60 text-muted border border-card-border')}>{t('common.cancel')}</button>
                <button disabled={busy || !(parseFloat(target) > 0) || (preset === 'custom' && !custom.trim())} onClick={create} className={cn(btn, 'flex-1 bg-indigo-600 text-white')}>{t('funds.create')}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 dark:text-indigo-400"><Plus size={16} /> {t('funds.new')}</button>
          )}
        </div>
      )}
    </div>
  );
}
