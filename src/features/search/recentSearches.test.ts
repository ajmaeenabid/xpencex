import { describe, expect, it } from 'vitest';
import { MAX_RECENTS, Recent, addRecent, cleanRecents, removeRecent } from './recentSearches';

const place = (id: string): Recent => ({ kind: 'place', id });
const text = (t: string): Recent => ({ kind: 'text', text: t });

describe('recent searches', () => {
  it('puts the newest first and moves a repeat to the top', () => {
    let list = addRecent([], place('pdf'));
    list = addRecent(list, text('food this month'));
    list = addRecent(list, place('pdf'));
    expect(list).toEqual([place('pdf'), text('food this month')]);
    expect(addRecent(list, text('FOOD this month'))[0]).toEqual(text('FOOD this month'));
    expect(addRecent(list, text('FOOD this month'))).toHaveLength(2);
  });

  it('keeps at most a few', () => {
    let list: Recent[] = [];
    for (let i = 0; i < 20; i++) list = addRecent(list, text(`q${i}`));
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0]).toEqual(text('q19'));
  });

  it('never keeps empty text or secrets', () => {
    expect(addRecent([], text('   '))).toEqual([]);
    expect(addRecent([], text('my pin is 4821'))).toEqual([]);
  });

  it('removes one', () => {
    const list = [place('pdf'), text('rent')];
    expect(removeRecent(list, text('rent'))).toEqual([place('pdf')]);
    expect(removeRecent(list, place('pdf'))).toEqual([text('rent')]);
  });

  it('drops damaged entries and places that no longer exist', () => {
    expect(cleanRecents('nope', ['pdf'])).toEqual([]);
    expect(cleanRecents([place('pdf'), place('gone'), { kind: 'text' }, text('ok'), null], ['pdf'])).toEqual([place('pdf'), text('ok')]);
  });
});
