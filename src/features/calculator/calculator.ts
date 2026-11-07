// Calculator logic, kept free of React so it can be tested. The expression is a plain string of
// what was typed; it is read by our own small parser (never eval).
import type { FinanceForm } from './finance';
import type { MoneyToolId, ToolValues } from './moneyTools';

export const OPS = ['+', '−', '×', '÷'] as const;
export type Op = (typeof OPS)[number];

const FUNCTIONS = ['sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'sin(', 'cos(', 'tan(', 'lg(', 'ln(', '√('] as const;
export type FunctionKey = (typeof FUNCTIONS)[number];

export type Key = Op | FunctionKey
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.'
  | 'AC' | 'DEL' | '='
  | '%' | '(' | ')' | '^' | '!' | 'π' | 'e' | '1/x';

export type CalcTab = 'calculator' | 'converter';
export type ConverterTool = 'currency' | 'finance' | MoneyToolId;
export type AngleUnit = 'deg' | 'rad';

export interface CalcState {
  expr: string;
  fresh: boolean; // the display shows a finished result; typing a digit starts over
  scientific: boolean; // the scientific keys are showing
  angle: AngleUnit;
  tab: CalcTab;
  tool: ConverterTool | null; // the converter tool that's open
  amount: string; // the amount to convert
  from: string; // currency to convert from
  to: string; // currency to convert into
  finance: FinanceForm;
  tools: Record<MoneyToolId, ToolValues>;
}

const MAX_DIGITS = 15;
const lastNumber = (expr: string) => expr.match(/[\d.]+$/)?.[0] || '';
const endsWithValue = (expr: string) => /[\d.)πe!%]$/.test(expr);
const hasOpenBracket = (expr: string) => (expr.match(/\(/g) || []).length > (expr.match(/\)/g) || []).length;
const isOpKey = (key: Key): key is Op => (OPS as readonly string[]).includes(key);
const isFunctionKey = (key: Key): key is FunctionKey => (FUNCTIONS as readonly string[]).includes(key);

/** Applies one key press */
export function press(state: CalcState, key: Key): CalcState {
  const { expr, fresh } = state;
  const next = (e: string, isFresh = false) => ({ ...state, expr: e, fresh: isFresh });
  const tidy = expr.endsWith('.') ? expr.slice(0, -1) : expr;

  if (key === 'AC') return next('');
  if (key === 'DEL') {
    if (fresh) return next('');
    const name = FUNCTIONS.find(f => expr.endsWith(f));
    return next(expr.slice(0, -(name?.length ?? 1)));
  }
  if (key === '=') {
    const result = evaluate(expr, state.angle);
    return typeof result === 'number' ? next(toPlain(result), true) : state;
  }

  if (key === '.') {
    if (fresh || expr === '') return next('0.');
    if (!/\d$/.test(expr)) return next(`${expr}0.`);
    return lastNumber(expr).includes('.') ? state : next(`${expr}.`);
  }

  if (isOpKey(key)) {
    if (expr === '' || expr === '−') return key === '−' ? next('−') : state; // only a minus can start
    if (expr.endsWith('(')) return key === '−' ? next(`${expr}−`) : state;
    if (expr.endsWith('^') && key === '−') return next(`${expr}−`);
    const base = tidy.replace(/[+−×÷^]+$/, '');
    return base === '' || base.endsWith('(') ? state : next(base + key);
  }

  if (key === '^') return endsWithValue(tidy) ? next(`${tidy}^`) : state;
  if (key === '!' || key === '%') return endsWithValue(tidy) ? next(tidy + key) : state;
  if (key === ')') return endsWithValue(tidy) && hasOpenBracket(tidy) ? next(`${tidy})`) : state;

  // 1/x on a finished result works on that result; otherwise it starts a new "1 ÷ (...)"
  if (key === '1/x') return fresh ? next(`1÷(${expr})`) : next(`${expr}1÷(`);

  // These start something new after a finished result
  if (key === '(' || key === 'π' || key === 'e' || isFunctionKey(key)) return next(fresh ? key : expr + key);

  // A digit
  if (fresh) return next(key);
  const current = lastNumber(expr);
  if (current.replace(/[^0-9]/g, '').length >= MAX_DIGITS) return state;
  if (current === '0') return next(expr.slice(0, -1) + key); // no leading zeros
  return next(expr + key);
}

export type CalcError = 'divZero' | 'mathError';

class Stop extends Error {
  constructor(public reason: CalcError | 'incomplete') { super(reason); }
}

const TRAILING = new RegExp(`(?:[+−×÷^.(]|${FUNCTIONS.map(f => f.replace(/[()]/g, '\\$&')).join('|')})+$`);
const NEAR_ZERO = 1e-12;

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Stop('mathError');
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/** The value of the expression, ignoring anything unfinished at the end (so it can preview while typing) */
export function evaluate(expr: string, angle: AngleUnit = 'deg'): number | CalcError | null {
  const text = expr.replace(TRAILING, '');
  if (!text || text === '−') return null;
  let at = 0;
  const toRadians = (n: number) => (angle === 'deg' ? (n * Math.PI) / 180 : n);
  const fromRadians = (n: number) => (angle === 'deg' ? (n * 180) / Math.PI : n);
  const snap = (n: number) => (Math.abs(n) < NEAR_ZERO ? 0 : n);

  const applyFunction = (name: string, n: number): number => {
    switch (name) {
      case 'sin(': return snap(Math.sin(toRadians(n)));
      case 'cos(': return snap(Math.cos(toRadians(n)));
      case 'tan(':
        // tan 90° has no answer, though rounding would give a huge number
        if (Math.abs(Math.cos(toRadians(n))) < NEAR_ZERO) throw new Stop('mathError');
        return snap(Math.tan(toRadians(n)));
      case 'sin⁻¹(':
      case 'cos⁻¹(':
        if (Math.abs(n) > 1) throw new Stop('mathError');
        return fromRadians(name === 'sin⁻¹(' ? Math.asin(n) : Math.acos(n));
      case 'tan⁻¹(': return fromRadians(Math.atan(n));
      case 'lg(':
      case 'ln(':
        if (n <= 0) throw new Stop('mathError');
        return name === 'lg(' ? Math.log10(n) : Math.log(n);
      case '√(':
        if (n < 0) throw new Stop('mathError');
        return Math.sqrt(n);
      default: throw new Stop('mathError');
    }
  };

  const closeBracket = () => {
    if (text[at] === ')') at++;
    else if (at < text.length) throw new Stop('incomplete');
    // A bracket left open at the end counts as closed
  };

  const primary = (): number => {
    const name = FUNCTIONS.find(f => text.startsWith(f, at));
    if (name) {
      at += name.length;
      const inner = additive();
      closeBracket();
      return applyFunction(name, inner);
    }
    const c = text[at];
    if (c === '(') {
      at++;
      const inner = additive();
      closeBracket();
      return inner;
    }
    if (c === 'π') { at++; return Math.PI; }
    if (c === 'e') { at++; return Math.E; }
    const number = text.slice(at).match(/^\d+\.?\d*|^\.\d+/)?.[0];
    if (!number) throw new Stop('incomplete');
    at += number.length;
    return Number(number);
  };

  // Returns whether it ended in %, because "200 + 10%" means 10% of 200
  const postfix = (): { value: number; percent: boolean } => {
    let value = primary();
    let percent = false;
    while (text[at] === '!' || text[at] === '%') {
      if (text[at] === '!') {
        value = factorial(value);
        percent = false;
      } else {
        value /= 100;
        percent = true;
      }
      at++;
    }
    return { value, percent };
  };

  const power = (): { value: number; percent: boolean } => {
    const base = postfix();
    if (text[at] !== '^') return base;
    at++;
    const value = base.value ** unary().value; // 2^3^2 is 2^(3^2), the usual way
    if (!Number.isFinite(value)) throw new Stop('mathError');
    return { value, percent: false };
  };

  const unary = (): { value: number; percent: boolean } => {
    if (text[at] !== '−') return power();
    at++;
    const inner = unary(); // so −2^2 is −4, the usual way
    return { value: -inner.value, percent: false };
  };

  const startsValue = () => at < text.length && /[\d.(πe√slct]/.test(text[at]);

  const term = (): { value: number; percent: boolean } => {
    let { value, percent } = unary();
    for (;;) {
      const c = text[at];
      if (c === '×' || c === '÷') {
        at++;
        const right = unary().value;
        if (c === '÷' && right === 0) throw new Stop('divZero');
        value = c === '×' ? value * right : value / right;
      } else if (startsValue()) {
        // Written side by side means multiply: 2π, 3(4+5), 2sin(30)
        value *= unary().value;
      } else {
        return { value, percent };
      }
      percent = false;
    }
  };

  function additive(): number {
    let value = term().value;
    while (text[at] === '+' || text[at] === '−') {
      const op = text[at++];
      const right = term();
      const amount = right.percent ? value * right.value : right.value;
      value = op === '+' ? value + amount : value - amount;
    }
    return value;
  }

  try {
    const value = additive();
    if (at < text.length) return null;
    if (!Number.isFinite(value)) return 'mathError';
    // Removes floating point noise like 0.1 + 0.2 = 0.30000000000000004
    return Number(value.toPrecision(15));
  } catch (err) {
    if (err instanceof Stop) return err.reason === 'incomplete' ? null : err.reason;
    throw err;
  }
}

/** True once scientific keys were used. Such a result isn't an amount of money to save. */
export const usesScience = (expr: string) => /[a-zπ√!^⁻]/.test(expr);

const tooLongForPlain = (n: number) => n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-6);

/** Very large or small numbers, written so the calculator can also read them back */
function scientificForm(n: number): string {
  const [mantissa, exponent] = n.toExponential(8).split('e');
  const short = mantissa.replace(/\.?0+$/, '');
  return `${short}×10^${Number(exponent)}`.replace(/-/g, '−');
}

/** A number as the calculator types it: no thousands commas, "−" for negatives */
export function toPlain(n: number): string {
  if (tooLongForPlain(n)) return scientificForm(n);
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 10 }).replace('-', '−');
}

/** The expression with commas in long numbers and spaces around operators, for the display */
export function formatExpr(expr: string): string {
  return expr.replace(/\d+(\.\d*)?/g, (num) => {
    const [whole, fraction] = num.split('.');
    return Number(whole).toLocaleString('en-US') + (fraction !== undefined ? `.${fraction}` : '');
  }).replace(/(?<![\^(]|^)([+−×÷])/g, ' $1 ');
}

/** An amount of money: whole taka as they are, otherwise always two decimals (8,718.90, not 8,718.9) */
export const formatMoney = (n: number) =>
  Number.isInteger(n) ? formatNumber(n) : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('-', '−');

/** A result for the display, with commas and at most 8 decimals */
export const formatNumber = (n: number) =>
  tooLongForPlain(n) ? scientificForm(n) : n.toLocaleString('en-US', { maximumFractionDigits: 8 }).replace('-', '−');

/** Rates are units of each currency per 1 USD */
export function convert(amount: number, from: string, to: string, rates: Record<string, number>): number | null {
  const a = rates[from];
  const b = rates[to];
  if (!a || !b) return null;
  return Math.round((amount / a) * b * 1e6) / 1e6;
}

// Kept for this browser session: it survives closing the calculator and switching tabs, and is
// cleared when the app is fully closed
const SESSION_KEY = 'xpencex.calculator';

export function loadSession(fallback: CalcState): CalcState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return saved && typeof saved.expr === 'string' ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}

export function saveSession(state: CalcState) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // not saved: the calculator still works, it just starts empty next time
  }
}
