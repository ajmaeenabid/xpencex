import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowLeft, BadgePercent, CheckCircle2, Coins, HandCoins, PiggyBank, ReceiptText, Tag, TableProperties, Users } from 'lucide-react';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import type { Account } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import Select from '../../shared/components/Select';
import { useI18n, TKey } from '../../shared/i18n';
import { accountDisplayName } from '../accounts/accounts';
import LoanForm from '../accounts/LoanForm';
import { btnPrimary, btnSecondary, hintClass, labelClass, selectClass } from '../accounts/ui';
import { CalcState, ConverterTool, convert, formatMoney, formatNumber } from './calculator';
import {
  FIELD_RULES, FinanceForm, InvestmentResult, LoanResult, PadKey,
  applyPadKey, calculateInvestment, calculateLoan, financeFormError, formatTyped, loanSchedule, totalMonths,
} from './finance';
import { MoneyToolId } from './moneyTools';
import { Keypad, NumberField, ResultRow, useKeyboard } from './ConverterParts';
import MoneyToolPanel from './MoneyToolPanel';

const CURRENCY_OPTIONS = MAJOR_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} (${c.symbol})` }));
const symbolOf = (code: string) => MAJOR_CURRENCIES.find(c => c.code === code)?.symbol || code;
const round2 = (n: number) => Math.round(n * 100) / 100;

const TOOLS: { id: ConverterTool; label: TKey; icon: typeof Coins }[] = [
  { id: 'currency', label: 'conv.currency', icon: Coins },
  { id: 'finance', label: 'conv.finance', icon: HandCoins },
  { id: 'discount', label: 'tool.discount', icon: Tag },
  { id: 'bill', label: 'tool.bill', icon: BadgePercent },
  { id: 'split', label: 'tool.split', icon: Users },
  { id: 'savings', label: 'tool.savings', icon: PiggyBank },
];

interface Props {
  state: CalcState;
  setState: React.Dispatch<React.SetStateAction<CalcState>>;
  rates: Record<string, number> | null; // units per 1 USD
  ratesFailed: boolean;
  userCurrency: string;
  uid: string;
  accounts: Account[];
  onSaveExpense: (amount: number, people?: number) => void;
  onManageAccounts: () => void;
  onClose: () => void;
}

/** The Converter tab: a list of tools, each opening its own screen */
export default function ConverterPanel(props: Props) {
  const { state, setState, onClose } = props;
  const { t } = useI18n();
  const openTool = (tool: ConverterTool | null) => setState(s => ({ ...s, tool }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement)?.closest('[role="listbox"],[role="combobox"]')) return;
      if (state.tool) openTool(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.tool, onClose]);

  if (!state.tool) {
    return (
      <div className="grid grid-cols-3 gap-2.5 pt-1">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            type="button"
            onClick={() => openTool(tool.id)}
            className="flex flex-col items-center gap-2.5 px-1 py-5 rounded-2xl bg-background/60 border border-card-border text-foreground font-bold text-xs hover:border-indigo-500/60 transition-colors"
          >
            <span className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 flex items-center justify-center">
              <tool.icon size={22} />
            </span>
            {t(tool.label)}
          </button>
        ))}
      </div>
    );
  }

  const title = TOOLS.find(tool => tool.id === state.tool)?.label ?? 'conv.finance';

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={() => openTool(null)}
          aria-label={t('common.back')}
          className="w-9 h-9 -ml-2 inline-flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-background/60"
        >
          <ArrowLeft size={20} />
        </button>
        <h3 className="font-bold text-foreground">{t(title)}</h3>
      </div>
      <div className="flex-1 min-h-0">
        {state.tool === 'currency' ? <CurrencyTool {...props} />
          : state.tool === 'finance' ? <FinanceTool {...props} />
          : (
            <MoneyToolPanel
              key={state.tool}
              tool={state.tool as MoneyToolId}
              values={state.tools[state.tool as MoneyToolId]}
              onChange={(values) => setState(s => ({ ...s, tools: { ...s.tools, [state.tool as MoneyToolId]: values } }))}
              symbol={symbolOf(props.userCurrency)}
              onSave={props.onSaveExpense}
            />
          )}
      </div>
    </div>
  );
}

function CurrencyTool({ state, setState, rates, ratesFailed, userCurrency, onSaveExpense }: Props) {
  const { t } = useI18n();
  const fresh = useRef(true);
  const amount = parseFloat(state.amount);
  const valid = Number.isFinite(amount) && amount > 0;
  const converted = valid && rates ? convert(amount, state.from, state.to, rates) : null;
  const perUnit = rates ? convert(1, state.from, state.to, rates) : null;
  // Expenses are saved in the user's own currency
  const expenseAmount = !valid ? null : state.from === userCurrency ? amount : rates ? convert(amount, state.from, userCurrency, rates) : null;
  const canSave = expenseAmount !== null && expenseAmount > 0;

  const onKey = (key: PadKey) => {
    setState(s => ({ ...s, amount: applyPadKey(s.amount, key, FIELD_RULES.amount, fresh.current) }));
    fresh.current = false;
  };
  useKeyboard(onKey);

  return (
    <div className="h-full flex flex-col gap-2.5">
      <div className="shrink-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5">
        <div>
          <label className={labelClass} htmlFor="calc-from">{t('calc.from')}</label>
          <Select id="calc-from" ariaLabel={t('calc.from')} value={state.from} onChange={(from) => setState(s => ({ ...s, from }))} options={CURRENCY_OPTIONS} className={selectClass} />
        </div>
        <button
          type="button"
          onClick={() => setState(s => ({ ...s, from: s.to, to: s.from }))}
          aria-label={t('conv.swap')}
          title={t('conv.swap')}
          className="w-9 h-12 inline-flex items-center justify-center rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-background/60"
        >
          <ArrowDownUp size={18} className="rotate-90" />
        </button>
        <div>
          <label className={labelClass} htmlFor="calc-to">{t('calc.to')}</label>
          <Select id="calc-to" ariaLabel={t('calc.to')} value={state.to} onChange={(to) => setState(s => ({ ...s, to }))} options={CURRENCY_OPTIONS} className={selectClass} />
        </div>
      </div>

      <section className="shrink-0 px-4 py-2.5 rounded-2xl bg-background/60 border border-card-border" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-muted">{t('conv.amount')}</span>
          <span id="conv-amount" className="text-xl font-bold tabular-nums text-foreground truncate">
            {symbolOf(state.from)}{formatTyped(state.amount) || '0'}
            <span aria-hidden="true" className="inline-block ml-0.5 w-0.5 h-4 bg-indigo-500 animate-pulse align-middle" />
          </span>
        </div>
        {rates ? (
          <>
            <p className="mt-1 text-right text-3xl font-bold tabular-nums truncate leading-tight text-indigo-700 dark:text-indigo-300">
              {symbolOf(state.to)}{formatMoney(converted !== null ? round2(converted) : 0)}
            </p>
            <p className="text-right text-[12px] text-muted font-medium">
              {perUnit !== null && t('calc.rate', { from: state.from, rate: formatNumber(perUnit), to: state.to })}
            </p>
          </>
        ) : (
          <p className="mt-1 min-h-[3.25rem] text-xs text-muted font-medium">{t(ratesFailed ? 'calc.ratesFailed' : 'calc.ratesLoading')}</p>
        )}
      </section>

      <Keypad onKey={onKey} />

      <button
        type="button"
        disabled={!canSave}
        onClick={() => expenseAmount !== null && onSaveExpense(round2(expenseAmount))}
        className="shrink-0 w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold bg-indigo-600 text-white disabled:opacity-50"
      >
        <ReceiptText size={18} />
        {canSave && state.from !== userCurrency
          ? t('calc.saveConverted', { amount: `${symbolOf(userCurrency)}${formatNumber(round2(expenseAmount!))}` })
          : t('calc.save')}
      </button>
    </div>
  );
}

type FieldName = 'amount' | 'rate' | 'years' | 'months';

function FinanceTool({ state, setState, userCurrency, uid, accounts, onManageAccounts }: Props) {
  const { t } = useI18n();
  const symbol = symbolOf(userCurrency);
  const form = state.finance;
  const [field, setField] = useState<FieldName>('amount');
  const fresh = useRef(true);
  const [problem, setProblem] = useState<ReturnType<typeof financeFormError>>(null);
  const [result, setResult] = useState<LoanResult | InvestmentResult | null>(null);
  const [addingLoan, setAddingLoan] = useState(false);
  const [loanAdded, setLoanAdded] = useState(false);
  const [showTable, setShowTable] = useState(false);

  // Changing anything makes an old answer wrong, so it goes until Calculate is tapped again
  const change = (patch: Partial<FinanceForm>) => {
    setState(s => ({ ...s, finance: { ...s.finance, ...patch } }));
    setResult(null);
    setProblem(null);
    setLoanAdded(false);
  };

  const tapField = (name: FieldName) => {
    setField(name);
    fresh.current = true;
    setResult(null);
    setLoanAdded(false);
  };

  const onKey = (key: PadKey) => {
    change({ [field]: applyPadKey(form[field], key, FIELD_RULES[field], fresh.current) });
    fresh.current = false;
  };

  const calculate = () => {
    const error = financeFormError(form);
    setProblem(error);
    setLoanAdded(false);
    if (error) {
      setResult(null);
      return;
    }
    const amount = parseFloat(form.amount);
    const rate = parseFloat(form.rate);
    const months = totalMonths(form);
    setResult(form.mode === 'loan' ? calculateLoan(amount, rate, months) : calculateInvestment(amount, rate, months, form.kind));
  };

  useKeyboard(onKey, calculate, !addingLoan);

  if (showTable && result && 'monthly' in result) {
    return <PaymentTable loan={result} rate={parseFloat(form.rate)} symbol={symbol} onBack={() => setShowTable(false)} />;
  }

  if (addingLoan && result && 'monthly' in result) {
    return (
      <div className="h-full overflow-y-auto no-scrollbar">
        <AddCalculatedLoan
          uid={uid}
          accounts={accounts}
          symbol={symbol}
          loan={result}
          onManageAccounts={onManageAccounts}
          onCancel={() => setAddingLoan(false)}
          onSaved={() => {
            setAddingLoan(false);
            setLoanAdded(true);
          }}
        />
      </div>
    );
  }

  const money = (n: number) => `${symbol}${formatMoney(n)}`;
  const amountLabel = form.mode === 'loan' ? 'fin.principal' : form.kind === 'monthly' ? 'fin.monthlyDeposit' : 'fin.investAmount';

  return (
    <div className="h-full flex flex-col gap-2">
      <Switch
        label={t('conv.finance')}
        value={form.mode}
        options={[{ value: 'loan', label: t('fin.loan') }, { value: 'investment', label: t('fin.investment') }]}
        onChange={(mode) => change({ mode: mode as FinanceForm['mode'] })}
      />

      <NumberField id="fin-amount" label={t(amountLabel, { symbol })} value={form.amount} active={!result && field === 'amount'} onTap={() => tapField('amount')} />
      <NumberField id="fin-rate" label={t('fin.rate')} value={form.rate} active={!result && field === 'rate'} onTap={() => tapField('rate')} />
      <div className="shrink-0 grid grid-cols-2 gap-2">
        <NumberField id="fin-years" compact label={t('fin.years')} value={form.years} active={!result && field === 'years'} onTap={() => tapField('years')} />
        <NumberField id="fin-months" compact label={t('fin.months')} value={form.months} active={!result && field === 'months'} onTap={() => tapField('months')} />
      </div>
      {/* Loan has no investment type, but keeps its space so the keys don't jump between the two.
          The answer has more to show, so it may use that space. */}
      <div className={cn('shrink-0 flex items-center justify-between gap-3 h-11', form.mode === 'loan' && 'invisible', result && 'hidden')} aria-hidden={form.mode === 'loan'}>
        <span className="text-xs font-semibold text-muted truncate">{t('fin.type')}</span>
        <div className="w-44 shrink-0">
          <Switch
            label={t('fin.type')}
            value={form.kind}
            options={[{ value: 'once', label: t('fin.once') }, { value: 'monthly', label: t('fin.monthly') }]}
            onChange={(kind) => change({ kind: kind as FinanceForm['kind'] })}
          />
        </div>
      </div>

      {/* The answer takes the keypad's place, so the window never changes size */}
      {result ? (
        <section aria-live="polite" className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-3.5 rounded-2xl bg-background/60 border border-card-border space-y-2">
          {'monthly' in result ? (
            <>
              <ResultRow label={t('fin.monthlyPayment')} value={money(result.monthly)} strong />
              <ResultRow label={t('fin.totalInterest')} value={money(result.interest)} />
              <ResultRow label={t('fin.totalRepay')} value={money(result.total)} />
              <p className={hintClass}>{t('fin.loanNote')}</p>
              {loanAdded && (
                <p role="status" className="flex items-start gap-2 text-xs font-bold text-teal-700 dark:text-teal-300">
                  <CheckCircle2 size={15} className="shrink-0 mt-px" /> {t('fin.added')}
                </p>
              )}
            </>
          ) : (
            <>
              <ResultRow label={t('fin.finalValue')} value={money(result.finalValue)} strong />
              <ResultRow label={t('fin.invested')} value={money(result.invested)} />
              <ResultRow label={t('fin.profit')} value={money(result.profit)} />
              <p className={hintClass}>{t('fin.investNote')}</p>
            </>
          )}
        </section>
      ) : (
        <Keypad onKey={onKey} decimals={FIELD_RULES[field].decimals > 0} />
      )}

      <p role={problem ? 'alert' : undefined} className="shrink-0 h-4 px-1 text-[12px] leading-4 font-bold text-rose-600 dark:text-rose-400 truncate">
        {problem ? t(problem) : ''}
      </p>

      {result && 'monthly' in result ? (
        // Side by side, so a loan's answer keeps enough room to show in full on a small phone
        <div className="shrink-0 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setShowTable(true)} className={cn(btnSecondary, 'w-full h-12 px-2')}>
            <TableProperties size={17} className="shrink-0" /> <span className="truncate">{t('fin.seeTable')}</span>
          </button>
          {loanAdded ? (
            <button type="button" onClick={() => tapField(field)} className={cn(btnSecondary, 'w-full h-12 px-2')}>
              <span className="truncate">{t('fin.change')}</span>
            </button>
          ) : (
            <button type="button" onClick={() => setAddingLoan(true)} className={cn(btnPrimary, 'w-full h-12 px-2')}>
              <HandCoins size={17} className="shrink-0" /> <span className="truncate">{t('fin.addLoan')}</span>
            </button>
          )}
        </div>
      ) : result ? (
        <button type="button" onClick={() => tapField(field)} className={cn(btnSecondary, 'shrink-0 w-full h-12')}>
          {t('fin.change')}
        </button>
      ) : (
        <button type="button" onClick={calculate} className="shrink-0 w-full h-12 rounded-xl text-sm font-bold bg-indigo-600 text-white">
          {t('fin.calculate')}
        </button>
      )}
    </div>
  );
}

/** The loan month by month. It scrolls inside the window, which keeps its size. */
function PaymentTable({ loan, rate, symbol, onBack }: { loan: LoanResult; rate: number; symbol: string; onBack: () => void }) {
  const { t } = useI18n();
  const rows = useMemo(() => loanSchedule(loan.principal, rate, loan.months), [loan.principal, rate, loan.months]);
  const grid = 'grid grid-cols-[2rem_repeat(3,minmax(0,1fr))] gap-1.5 px-2.5 text-right tabular-nums';
  return (
    <div className="h-full flex flex-col gap-2">
      <section className="flex-1 min-h-0 overflow-y-auto no-scrollbar rounded-2xl border border-card-border bg-background/60">
        <div className={cn(grid, 'sticky top-0 py-2 text-[12px] font-bold text-muted bg-[var(--card-solid)] border-b border-card-border')}>
          <span className="text-left">{t('fin.tableMonth')}</span>
          <span>{t('fin.tablePayment')} ({symbol})</span>
          <span>{t('fin.tableInterest')} ({symbol})</span>
          <span>{t('fin.tableBalance')} ({symbol})</span>
        </div>
        {rows.map(row => (
          <div key={row.month} className={cn(grid, 'py-1.5 text-xs font-semibold text-foreground border-b border-card-border/60 last:border-b-0')}>
            <span className="text-left text-muted">{row.month}</span>
            <span className="break-all">{formatMoney(row.payment)}</span>
            <span className="break-all">{formatMoney(row.interest)}</span>
            <span className="break-all">{formatMoney(row.balance)}</span>
          </div>
        ))}
      </section>
      <button type="button" onClick={onBack} className={cn(btnSecondary, 'shrink-0 w-full h-12')}>{t('fin.backToAnswer')}</button>
    </div>
  );
}

function Switch({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="shrink-0 grid grid-cols-2 gap-1 p-1 rounded-xl bg-background/60 border border-card-border">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-9 rounded-lg text-sm font-bold transition-colors',
            value === option.value ? 'bg-indigo-600 text-white' : 'text-muted hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The calculated numbers, plus the details only the person knows: name, lender, day and account */
function AddCalculatedLoan({ uid, accounts, symbol, loan, onManageAccounts, onCancel, onSaved }: {
  uid: string;
  accounts: Account[];
  symbol: string;
  loan: LoanResult;
  onManageAccounts: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const account = accounts.find(a => a.id === accountId);

  if (!account) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-muted leading-relaxed">{t('fin.noAccounts')}</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className={btnSecondary}>{t('common.back')}</button>
          <button type="button" onClick={onManageAccounts} className={btnPrimary}>{t('fin.openAccounts')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-1">
      <div>
        <label className={labelClass} htmlFor="fin-account">{t('fin.account')}</label>
        <Select
          id="fin-account"
          ariaLabel={t('fin.account')}
          value={account.id}
          onChange={setAccountId}
          options={accounts.map(a => ({ value: a.id, label: accountDisplayName(a) }))}
          className={selectClass}
        />
      </div>
      <LoanForm
        key={account.id}
        uid={uid}
        account={account}
        accounts={accounts}
        symbol={symbol}
        calculated={{ total: loan.total, installment: loan.monthly, received: loan.principal }}
        onDone={onCancel}
        onSaved={onSaved}
      />
    </div>
  );
}
