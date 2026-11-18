import { useState } from 'react';
import { ChevronRight, Pencil, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import type { Account } from '../../shared/types';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import FullWindow, { usePages } from '../../shared/components/FullWindow';
import { btnPrimary, btnSecondary, btnSmall, card, inputClass } from '../accounts/ui';
import { EmptyState } from '../funds/FundsWindow';
import TapCard from '../home/TapCard';
import FinishShoppingSheet from './FinishShoppingSheet';
import {
  MAX_ITEM_NAME, MAX_LISTS, MAX_LIST_NAME, MAX_QTY, ShoppingItem, ShoppingList, addItems, cleanShoppingText, costOf, listTotals, makeItem, removeItem, setPaid, toggleItem,
} from './shopping';
import { createShoppingList, deleteShoppingList, renameShoppingList, saveShoppingItems, useShoppingLists } from './shoppingService';

type Page = { page: 'lists' } | { page: 'list'; id: string };

/** Home: how much is left to buy. Tap to open the shopping lists. */
export default function ShoppingCard({ uid, accounts, symbol }: { uid: string; accounts: Account[]; symbol: string }) {
  const { t } = useI18n();
  const lists = useShoppingLists(uid);
  const [open, setOpen] = useState(false);
  const nav = usePages<Page>({ page: 'lists' });
  const [finishing, setFinishing] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const close = () => { setOpen(false); nav.reset(); setError(''); };
  const fail = (err: unknown) => { console.error('Shopping list change failed:', err); alertDialog(t('shopping.error')); };

  const waiting = lists.find(l => listTotals(l.items).left > 0);
  const left = waiting ? listTotals(waiting.items) : null;

  const addList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (lists.length >= MAX_LISTS) { setError(t('shopping.fullLists', { max: MAX_LISTS })); return; }
    if (!cleanShoppingText(newName, MAX_LIST_NAME)) { setError(t('secret.warning')); return; }
    setError('');
    try { await createShoppingList(uid, newName); setNewName(''); } catch (err) { fail(err); }
  };

  const page = nav.page;
  const current = page.page === 'list' ? lists.find(l => l.id === page.id) : undefined;
  const finishList = lists.find(l => l.id === finishing);

  return (
    <>
      <TapCard
        Icon={ShoppingCart}
        iconTone={waiting ? 'warning' : 'info'}
        label={t('shopping.title')}
        headline={waiting ? waiting.name : t('shopping.emptyCard')}
        chip={left ? t('shopping.itemsLeft', { count: left.left }) : undefined}
        chipTone="info"
        chipIcon={ShoppingCart}
        onOpen={() => setOpen(true)}
      />
      <FullWindow
        open={open}
        atRoot={nav.atRoot}
        onClose={close}
        onBack={nav.back}
        pageKey={nav.depth + page.page}
        icon={<ShoppingCart size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />}
        title={current?.name || t('shopping.title')}
      >
        {page.page === 'lists' ? (
          <>
            <form onSubmit={addList} className="flex gap-2">
              <input maxLength={MAX_LIST_NAME} aria-label={t('shopping.newList')} placeholder={t('shopping.newListHint')} className={inputClass} value={newName} onChange={e => setNewName(e.target.value)} />
              <button type="submit" aria-label={t('shopping.newList')} className={cn(btnPrimary, 'shrink-0 w-12 px-0')}><Plus size={18} /></button>
            </form>
            {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
            {lists.length === 0 ? (
              <EmptyState title={t('shopping.emptyTitle')} text={t('shopping.emptyBody')} button={null} />
            ) : (
              <div className="space-y-3">
                {lists.map(list => {
                  const totals = listTotals(list.items);
                  return (
                    <button key={list.id} onClick={() => nav.go({ page: 'list', id: list.id })} className={cn(card, 'w-full p-4 flex items-center gap-3 text-left')}>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-foreground truncate">{list.name}</span>
                        <span className="block text-xs font-medium text-muted">
                          {t('shopping.itemsLeft', { count: totals.left })}{totals.estimate > 0 && ` · ${t('shopping.estimate', { amount: money(totals.estimate) })}`}
                        </span>
                      </span>
                      <ChevronRight size={20} className="text-muted shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : current ? (
          <ListPage list={current} money={money} symbol={symbol} onFail={fail} onFinish={() => setFinishing(current.id)} onDeleted={nav.back} />
        ) : (
          <p className="text-center py-16 text-sm text-muted font-medium">{t('shopping.gone')}</p>
        )}
      </FullWindow>
      {finishList && <FinishShoppingSheet key={finishList.id} list={finishList} accounts={accounts} symbol={symbol} onClose={() => setFinishing(null)} />}
    </>
  );
}

function ListPage({ list, money, symbol, onFail, onFinish, onDeleted }: {
  list: ShoppingList;
  money: (n: number) => string;
  symbol: string;
  onFail: (err: unknown) => void;
  onFinish: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const totals = listTotals(list.items);
  const save = (items: ShoppingItem[]) => { saveShoppingItems(list.id, items).catch(onFail); };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const item = makeItem({ name, qty, price });
    if (!item) { setName(''); setError(t('secret.warning')); return; }
    const next = addItems(list.items, [item]);
    if (next.length === list.items.length) { setError(t('shopping.notAdded')); return; }
    setError('');
    save(next);
    setName(''); setQty(''); setPrice('');
  };

  const rename = async () => {
    if (!renaming?.trim()) { setRenaming(null); return; }
    if (!cleanShoppingText(renaming, MAX_LIST_NAME)) { setError(t('secret.warning')); return; }
    try { await renameShoppingList(list.id, renaming); setRenaming(null); setError(''); } catch (err) { onFail(err); }
  };

  const remove = async () => {
    if (!(await confirmDialog(t('shopping.confirmDelete', { name: list.name }), { danger: true }))) return;
    try { await deleteShoppingList(list.id); onDeleted(); } catch (err) { onFail(err); }
  };

  const ordered = [...list.items.filter(i => !i.done), ...list.items.filter(i => i.done)];

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className={cn(card, 'p-4')}>
          <p className="text-xs text-muted font-semibold">{t('shopping.estimateLabel')}</p>
          <p className="text-lg font-bold text-foreground tabular-nums">{money(totals.estimate)}</p>
        </div>
        <div className={cn(card, 'p-4')}>
          <p className="text-xs text-muted font-semibold">{t('shopping.inCart', { count: totals.bought })}</p>
          <p className="text-lg font-bold text-foreground tabular-nums">{money(totals.spent)}</p>
        </div>
      </div>

      <form onSubmit={add} className={cn(card, 'p-4 space-y-2')}>
        <input maxLength={MAX_ITEM_NAME} aria-label={t('shopping.itemName')} placeholder={t('shopping.itemName')} className={inputClass} value={name} onChange={e => setName(e.target.value)} />
        <div className="flex gap-2">
          <input maxLength={MAX_QTY} aria-label={t('shopping.qty')} placeholder={t('shopping.qty')} className={inputClass} value={qty} onChange={e => setQty(e.target.value)} />
          <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={t('shopping.price', { symbol })} placeholder={t('shopping.price', { symbol })} className={inputClass} value={price} onChange={e => setPrice(e.target.value)} />
          <button type="submit" aria-label={t('shopping.addItem')} className={cn(btnPrimary, 'shrink-0 w-12 px-0')}><Plus size={18} /></button>
        </div>
      </form>
      {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      {ordered.length === 0 ? (
        <p className="text-center py-6 text-sm text-muted font-medium">{t('shopping.noItems')}</p>
      ) : (
        <div className={cn(card, 'divide-y divide-card-border')}>
          {ordered.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-3">
              <input type="checkbox" aria-label={item.name} className="w-5 h-5 shrink-0 accent-indigo-600" checked={item.done} onChange={() => save(toggleItem(list.items, item.id))} />
              <span className="flex-1 min-w-0">
                <span className={cn('block text-sm font-bold truncate', item.done ? 'text-muted line-through' : 'text-foreground')}>{item.name}</span>
                {item.qty && <span className="block text-xs font-medium text-muted truncate">{item.qty}</span>}
              </span>
              {item.done ? (
                <input
                  key={`${item.id}${item.paid ?? ''}`}
                  type="number" min="0" step="0.01" inputMode="decimal"
                  aria-label={t('shopping.paidFor', { name: item.name })}
                  placeholder={symbol}
                  defaultValue={costOf(item) || ''}
                  onBlur={e => { if (parseFloat(e.target.value || '0') !== costOf(item)) save(setPaid(list.items, item.id, e.target.value)); }}
                  className="w-24 h-9 px-2 rounded-lg bg-background/60 border border-card-border text-sm text-right text-foreground outline-none focus:border-indigo-500"
                />
              ) : item.price !== undefined && (
                <span className="shrink-0 text-sm font-bold text-foreground tabular-nums">{money(item.price)}</span>
              )}
              <button onClick={() => save(removeItem(list.items, item.id))} aria-label={t('shopping.removeItem', { name: item.name })} className="shrink-0 p-1.5 text-muted hover:text-rose-500"><X size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {totals.bought > 0 && <button onClick={onFinish} className={cn(btnPrimary, 'w-full')}><ShoppingCart size={16} /> {t('shopping.finish', { count: totals.bought })}</button>}

      {renaming === null ? (
        <div className="flex gap-2">
          <button onClick={() => setRenaming(list.name)} className={cn(btnSmall, 'border border-card-border text-foreground')}><Pencil size={14} /> {t('shopping.rename')}</button>
          <button onClick={remove} className={cn(btnSmall, 'border border-card-border text-rose-600 dark:text-rose-400')}><Trash2 size={14} /> {t('shopping.deleteList')}</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input autoFocus maxLength={MAX_LIST_NAME} aria-label={t('shopping.rename')} className={inputClass} value={renaming} onChange={e => setRenaming(e.target.value)} />
          <button onClick={rename} className={cn(btnPrimary, 'shrink-0')}>{t('common.save')}</button>
          <button onClick={() => setRenaming(null)} className={cn(btnSecondary, 'shrink-0')}>{t('common.cancel')}</button>
        </div>
      )}
    </>
  );
}
