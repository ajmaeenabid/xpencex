import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import type { Account } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { CalcState, CalcTab, loadSession, saveSession } from './calculator';
import { emptyFinanceForm } from './finance';
import { emptyToolValues } from './moneyTools';
import ConverterPanel from './ConverterPanel';
import { useExchangeRates } from './ratesService';
import CalculatorPanel from './CalculatorPanel';

interface Props {
  open: boolean;
  onClose: () => void;
  userCurrency: string;
  /** The result in the user's own currency, to prefill a new expense */
  onSaveExpense: (amount: number, people?: number) => void;
  uid: string;
  accounts: Account[];
  onManageAccounts: () => void;
}

/** The calculator popup. What is typed stays until the app is fully closed. */
export default function CalculatorSheet({ open, onClose, userCurrency, onSaveExpense, uid, accounts, onManageAccounts }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<CalcState>(() =>
    loadSession({
      expr: '', fresh: false, scientific: false, angle: 'deg', tab: 'calculator', tool: null, amount: '',
      from: userCurrency, to: userCurrency === 'USD' ? 'BDT' : 'USD', finance: emptyFinanceForm, tools: emptyToolValues,
    }));
  // Rates are only loaded once the currency tool is opened
  const { rates, failed } = useExchangeRates(open && state.tab === 'converter' && state.tool === 'currency');
  const tabs: { id: CalcTab; label: string }[] = [
    { id: 'calculator', label: t('calc.tabCalculator') },
    { id: 'converter', label: t('calc.tabConverter') },
  ];

  useEffect(() => { saveSession(state); }, [state]);

  // The page behind doesn't scroll while open
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('calc.title')}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="relative w-full max-w-md h-[min(94dvh,680px)] overflow-hidden bg-card text-foreground border border-card-border rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl"
          >
            <div className="h-full flex flex-col gap-3 px-4 pt-4 pb-4">
              <header className="shrink-0 flex items-center gap-3">
                <div role="tablist" aria-label={t('calc.title')} className="flex-1 flex items-center gap-5">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={state.tab === tab.id}
                      // Coming back to the Converter tab always starts at its list; what was typed stays
                      onClick={() => setState(s => ({ ...s, tab: tab.id, tool: null }))}
                      className={cn(
                        'pb-1 text-lg font-bold border-b-2 transition-colors',
                        state.tab === tab.id ? 'text-foreground border-indigo-600' : 'text-muted border-transparent hover:text-foreground',
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button onClick={onClose} aria-label={t('common.close')} className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-background/60">
                  <X size={20} />
                </button>
              </header>
              <div className="flex-1 min-h-0">
              {state.tab === 'calculator' ? (
                <CalculatorPanel state={state} setState={setState} uid={uid} onClose={onClose} onSaveExpense={onSaveExpense} />
              ) : (
                <ConverterPanel
                  state={state}
                  setState={setState}
                  rates={rates?.rates || null}
                  ratesFailed={failed}
                  userCurrency={userCurrency}
                  uid={uid}
                  accounts={accounts}
                  onSaveExpense={onSaveExpense}
                  onManageAccounts={onManageAccounts}
                  onClose={onClose}
                />
              )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
