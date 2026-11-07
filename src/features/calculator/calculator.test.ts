import { describe, it, expect } from 'vitest';
import { CalcState, Key, convert, evaluate, formatExpr, formatMoney, formatNumber, press, toPlain, usesScience } from './calculator';
import { emptyFinanceForm } from './finance';
import { emptyToolValues } from './moneyTools';
import { ratesAreStale } from '../../../ai-server/src/rates';

const start: CalcState = { expr: '', fresh: false, scientific: false, angle: 'deg', tab: 'calculator', tool: null, amount: '', finance: emptyFinanceForm, tools: emptyToolValues, from: 'BDT', to: 'USD' };
const type = (keys: Key[], state = start) => keys.reduce(press, state);

describe('calculator keys', () => {
  it('builds an expression and works out the result', () => {
    const s = type(['1', '2', '0', '0', '+', '3', '5', '0', '×', '2', '=']);
    expect(s.expr).toBe('1900'); // × before +
    expect(s.fresh).toBe(true);
  });

  it('starts over when a digit follows a result, and keeps going after an operator', () => {
    const done = type(['5', '+', '5', '=']);
    expect(press(done, '7').expr).toBe('7');
    expect(type(['−', '3'], done).expr).toBe('10−3');
  });

  it('replaces a doubled operator and blocks a second decimal point', () => {
    expect(type(['8', '+', '×']).expr).toBe('8×');
    expect(type(['1', '.', '5', '.', '2']).expr).toBe('1.52');
    expect(type(['.', '5']).expr).toBe('0.5');
    expect(type(['0', '0', '7']).expr).toBe('7');
  });

  it('allows a negative start, deletes and clears', () => {
    expect(type(['×']).expr).toBe('');
    expect(type(['−', '4', '+', '1', '=']).expr).toBe('−3');
    expect(type(['1', '2', 'DEL']).expr).toBe('1');
    expect(type(['1', '2', 'AC']).expr).toBe('');
  });
});

describe('evaluate', () => {
  it('handles order, decimals and a trailing operator', () => {
    expect(evaluate('10−2×3')).toBe(4);
    expect(evaluate('0.1+0.2')).toBe(0.3);
    expect(evaluate('7÷2+')).toBe(3.5);
    expect(evaluate('')).toBeNull();
  });

  it('refuses to divide by zero', () => {
    expect(evaluate('5÷0')).toBe('divZero');
  });

  it('formats for the display', () => {
    expect(formatExpr('1250000+300.5')).toBe('1,250,000 + 300.5');
    expect(formatExpr('−12.')).toBe('−12.');
    expect(toPlain(-0.5)).toBe('−0.5');
  });
});

describe('scientific', () => {
  const near = (expr: string, want: number, angle: 'deg' | 'rad' = 'deg') => {
    const got = evaluate(expr, angle);
    expect(typeof got).toBe('number');
    expect(got as number).toBeCloseTo(want, 8);
  };
  it('works out trigonometry in degrees and radians', () => {
    near('sin(30)', 0.5);
    near('cos(60)', 0.5);
    near('tan(45)', 1);
    near('sin(90)', 1);
    expect(evaluate('sin(180)')).toBe(0);
    near('sin(π÷2)', 1, 'rad');
    expect(evaluate('sin(π)', 'rad')).toBe(0);
  });
  it('works out inverse trigonometry', () => {
    near('sin⁻¹(0.5)', 30);
    near('cos⁻¹(0.5)', 60);
    near('tan⁻¹(1)', 45);
    near('sin⁻¹(1)', Math.PI / 2, 'rad');
  });
  it('works out logarithms, roots, powers and factorials', () => {
    expect(evaluate('lg(1000)')).toBe(3);
    near('ln(e)', 1);
    expect(evaluate('√(144)')).toBe(12);
    expect(evaluate('2^10')).toBe(1024);
    expect(evaluate('5!')).toBe(120);
    expect(evaluate('0!')).toBe(1);
    expect(evaluate('1÷(4)')).toBe(0.25);
    near('π', Math.PI);
    near('e', Math.E);
  });
  it('follows the usual order', () => {
    expect(evaluate('2+3×4')).toBe(14);
    expect(evaluate('(2+3)×4')).toBe(20);
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('−2^2')).toBe(-4);
    expect(evaluate('2^−1')).toBe(0.5);
    expect(evaluate('2×3!')).toBe(12);
    expect(evaluate('√(9)+√(16)')).toBe(7);
  });
  it('reads things written side by side as multiply', () => {
    expect(evaluate('3(4+5)')).toBe(27);
    expect(evaluate('(1+1)(2+2)')).toBe(8);
    near('2π', 2 * Math.PI);
    near('2sin(30)', 1);
  });
  it('closes brackets left open, and ignores anything unfinished', () => {
    expect(evaluate('(2+3')).toBe(5);
    expect(evaluate('√(16')).toBe(4);
    expect(evaluate('5+sin(')).toBe(5);
    expect(evaluate('2^')).toBe(2);
    expect(evaluate('sin(')).toBeNull();
  });
  it('treats % the way people expect', () => {
    expect(evaluate('50%')).toBe(0.5);
    expect(evaluate('200+10%')).toBe(220);
    expect(evaluate('200−10%')).toBe(180);
    expect(evaluate('200×10%')).toBe(20);
    expect(evaluate('50+10%+10%')).toBe(60.5);
  });
  it('says when there is no answer, rather than showing a wrong one', () => {
    expect(evaluate('√(0−4)')).toBe('mathError');
    expect(evaluate('lg(0)')).toBe('mathError');
    expect(evaluate('ln(0−1)')).toBe('mathError');
    expect(evaluate('sin⁻¹(2)')).toBe('mathError');
    expect(evaluate('tan(90)')).toBe('mathError');
    expect(evaluate('0.5!')).toBe('mathError');
    expect(evaluate('171!')).toBe('mathError');
    expect(evaluate('10^999')).toBe('mathError');
    expect(evaluate('1÷(0)')).toBe('divZero');
    expect(evaluate('5÷sin(0)')).toBe('divZero');
  });
  it('keeps long sums accurate', () => {
    expect(evaluate('123456789012345+1')).toBe(123456789012346);
    expect(evaluate('1÷1000000000')).toBe(1e-9);
  });
});

describe('scientific keys', () => {
  it('lets a function follow a number, and starts over after a result', () => {
    expect(type(['2', 'π']).expr).toBe('2π');
    expect(type(['sin(', '3', '0', ')', '=']).expr).toBe('0.5');
    expect(press(type(['5', '+', '5', '=']), 'sin(').expr).toBe('sin(');
  });
  it('deletes a whole function name at once', () => {
    expect(type(['5', '+', 'sin⁻¹(', 'DEL']).expr).toBe('5+');
    expect(type(['lg(', 'DEL']).expr).toBe('');
  });
  it('only closes a bracket that is open', () => {
    expect(type(['5', ')']).expr).toBe('5');
    expect(type(['(', ')']).expr).toBe('(');
    expect(type(['(', '5', ')', ')']).expr).toBe('(5)');
  });
  it('only allows ! % ^ after a value', () => {
    expect(type(['!']).expr).toBe('');
    expect(type(['%']).expr).toBe('');
    expect(type(['^']).expr).toBe('');
    expect(type(['5', '+', '!']).expr).toBe('5+');
    expect(type(['5', '!']).expr).toBe('5!');
    expect(type(['5', '.', '%']).expr).toBe('5%');
  });
  it('handles minus after a bracket or power, but no other operator there', () => {
    expect(type(['(', '−', '5']).expr).toBe('(−5');
    expect(type(['(', '×']).expr).toBe('(');
    expect(type(['2', '^', '−', '3', '=']).expr).toBe('0.125');
  });
  it('1/x works on a result, or starts a new one', () => {
    expect(type(['4', '=', '1/x', '=']).expr).toBe('0.25');
    expect(type(['1/x', '4', '=']).expr).toBe('0.25');
  });
  it('uses the chosen angle unit', () => {
    expect(type(['sin(', '3', '0', '='], { ...start, angle: 'rad' }).expr).not.toBe('0.5');
  });
  it('can carry on from very large and very small results', () => {
    const big = type(['5', '0', '!', '=']);
    expect(big.expr).toBe('3.04140932×10^64');
    expect(formatNumber(evaluate(big.expr) as number)).toBe('3.04140932×10^64');
    expect(toPlain(0.00000001)).toBe('1×10^−8');
    expect(evaluate(toPlain(0.00000001))).toBe(1e-8);
  });
  it('knows which results came from scientific keys', () => {
    expect(usesScience('1200+15%')).toBe(false);
    expect(usesScience('5×(2+3)')).toBe(false);
    expect(usesScience('sin(30)')).toBe(true);
    expect(usesScience('2π')).toBe(true);
    expect(usesScience('5!')).toBe(true);
    expect(usesScience('2^3')).toBe(true);
  });
  it('shows brackets, powers and negative numbers tidily', () => {
    expect(formatExpr('(−5+1000)×2^−3')).toBe('(−5 + 1,000) × 2^−3');
  });
});

describe('currency conversion', () => {
  const rates = { USD: 1, BDT: 124.144543, EUR: 0.897215 };

  it('converts through USD', () => {
    expect(convert(124.144543, 'BDT', 'USD', rates)).toBe(1);
    expect(convert(1000, 'BDT', 'EUR', rates)).toBeCloseTo(7.227, 3);
    expect(convert(10, 'BDT', 'JPY', rates)).toBeNull();
  });

  it('treats rates older than 10 days as stale', () => {
    const now = Date.parse('2026-10-30T00:00:00Z');
    expect(ratesAreStale('2026-10-25T00:00:00Z', now)).toBe(false);
    expect(ratesAreStale('2026-10-19T00:00:00Z', now)).toBe(true);
    expect(ratesAreStale(undefined, now)).toBe(true);
  });
});

describe('formatMoney', () => {
  it('always shows two decimals unless the amount is whole', () => {
    expect(formatMoney(8718.9)).toBe('8,718.90');
    expect(formatMoney(1200)).toBe('1,200');
    expect(formatMoney(0.5)).toBe('0.50');
    expect(formatMoney(33.333)).toBe('33.33');
    expect(formatMoney(-2.5)).toBe('−2.50');
  });
});
