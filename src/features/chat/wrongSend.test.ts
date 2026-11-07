import { describe, it, expect } from 'vitest';
import { WRONG_SEND, telLink, wrongSendProvider } from './wrongSend';

describe('wrong-send helper', () => {
  it('knows the provider of a Send Money expense', () => {
    expect(wrongSendProvider('bKash Send Money to Rahim')).toBe('bkash');
    expect(wrongSendProvider('Nagad Send Money')).toBe('nagad');
    expect(wrongSendProvider('Rocket Send Money to 01•••')).toBe('rocket');
  });

  it('only shows for Send Money', () => {
    expect(wrongSendProvider('bKash Cash Out')).toBeNull();
    expect(wrongSendProvider('Bank transfer')).toBeNull();
  });

  it('makes dialable links', () => {
    expect(telLink('096 096 16167')).toBe('tel:09609616167');
    expect(telLink('02-55663001')).toBe('tel:0255663001');
    expect(telLink('16247')).toBe('tel:16247');
  });

  it('has a helpline for every provider', () => {
    for (const p of Object.values(WRONG_SEND)) expect(p.helplines.length).toBeGreaterThan(0);
  });
});
