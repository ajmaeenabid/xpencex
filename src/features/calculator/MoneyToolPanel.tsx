import { useRef, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { cn } from '../../shared/lib/utils';
import { useI18n, TKey } from '../../shared/i18n';
import { formatMoney } from './calculator';
import { FIELD_RULES, FieldRules, PadKey, applyPadKey } from './finance';
import { MONEY_TOOLS, MoneyToolId, ToolValues } from './moneyTools';
import { Keypad, NumberField, ResultRow, useKeyboard } from './ConverterParts';

// `half` boxes sit two to a row, so tools with three boxes leave the keys enough room on a small phone
type Field = { name: string; label: TKey; money?: boolean; rules: FieldRules; half?: boolean };

const percent = FIELD_RULES.rate;
const FIELDS: Record<MoneyToolId, Field[]> = {
  discount: [
    { name: 'price', label: 'tool.price', money: true, rules: FIELD_RULES.amount },
    { name: 'percent', label: 'tool.discountPercent', rules: percent },
  ],
  bill: [
    { name: 'amount', label: 'tool.billAmount', money: true, rules: FIELD_RULES.amount },
    { name: 'vat', label: 'tool.vatPercent', rules: percent, half: true },
    { name: 'tip', label: 'tool.tipPercent', rules: percent, half: true },
  ],
  split: [
    { name: 'total', label: 'tool.billAmount', money: true, rules: FIELD_RULES.amount },
    { name: 'people', label: 'tool.people', rules: { decimals: 0, maxWhole: 3 } },
  ],
  savings: [
    { name: 'goal', label: 'tool.goal', money: true, rules: FIELD_RULES.amount },
    { name: 'saved', label: 'tool.alreadySaved', money: true, rules: FIELD_RULES.amount, half: true },
    { name: 'months', label: 'fin.months', rules: FIELD_RULES.months, half: true },
  ],
};

/** Pairs up neighbouring half boxes into one row */
function rowsOf(fields: Field[]): Field[][] {
  const rows: Field[][] = [];
  for (const f of fields) {
    const last = rows.at(-1);
    if (f.half && last?.length === 1 && last[0].half) last.push(f);
    else rows.push([f]);
  }
  return rows;
}

interface Props {
  tool: MoneyToolId;
  values: ToolValues;
  onChange: (values: ToolValues) => void;
  symbol: string;
  onSave: (amount: number, people?: number) => void;
}

/** Discount, VAT or tip, Split the bill and Savings goal: boxes, a live answer, and the keypad */
export default function MoneyToolPanel({ tool, values, onChange, symbol, onSave }: Props) {
  const { t } = useI18n();
  const fields = FIELDS[tool];
  const [active, setActive] = useState(fields[0].name);
  const fresh = useRef(true);
  const field = fields.find(f => f.name === active) ?? fields[0];
  const result = MONEY_TOOLS[tool](values);

  const onKey = (key: PadKey) => {
    onChange({ ...values, [field.name]: applyPadKey(values[field.name] || '', key, field.rules, fresh.current) });
    fresh.current = false;
  };
  useKeyboard(onKey);

  return (
    <div className="h-full flex flex-col gap-2">
      {rowsOf(fields).map(row => (
        <div key={row[0].name} className={cn('shrink-0', row.length > 1 && 'grid grid-cols-2 gap-2')}>
          {row.map(f => (
            <NumberField
              key={f.name}
              id={`tool-${f.name}`}
              compact={row.length > 1}
              label={f.money ? `${t(f.label)} (${symbol})` : t(f.label)}
              value={values[f.name] || ''}
              active={f.name === field.name}
              onTap={() => {
                setActive(f.name);
                fresh.current = true;
              }}
            />
          ))}
        </div>
      ))}

      <section aria-live="polite" className="shrink-0 px-3.5 py-2.5 rounded-2xl bg-background/60 border border-card-border space-y-1">
        {result.rows.map(row => (
          <ResultRow
            key={row.label}
            label={t(row.label)}
            value={tool === 'split' && row.label === 'tool.eachShare' && !values.total ? `${symbol}0` : `${symbol}${formatMoney(row.value)}`}
            strong={row.strong}
          />
        ))}
      </section>

      <p role={result.note?.kind === 'error' ? 'alert' : undefined} className={cn(
        'shrink-0 h-4 px-1 text-[12px] leading-4 font-bold truncate',
        result.note?.kind === 'good' ? 'text-teal-700 dark:text-teal-300' : 'text-rose-600 dark:text-rose-400',
      )}>
        {result.note ? t(result.note.text) : ''}
      </p>

      <Keypad onKey={onKey} decimals={field.rules.decimals > 0} />

      {tool !== 'savings' && (
        <button
          type="button"
          disabled={!result.save}
          onClick={() => result.save && onSave(result.save.amount, result.save.people)}
          className="shrink-0 w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold bg-indigo-600 text-white disabled:opacity-50"
        >
          <ReceiptText size={18} />
          {t('calc.save')}
        </button>
      )}
    </div>
  );
}
