import { describe, it, expect } from 'vitest';
import { parseModelJson } from './aiResponse';

describe('parseModelJson', () => {
  it('reads normal JSON', () => {
    expect(parseModelJson('{"type":"chat","content":"Hi"}').content).toBe('Hi');
  });

  it("repairs an invalid \\' escape", () => {
    const raw = String.raw`{"type":"chat","content":"Cox\'s Bazar plan"}`;
    expect(parseModelJson(raw).content).toBe("Cox's Bazar plan");
  });

  it('repairs raw line breaks inside strings and trailing commas', () => {
    const raw = '{"type":"chat","content":"Line 1\nLine 2","steps":["a",],}';
    const parsed = parseModelJson(raw);
    expect(parsed.content).toBe('Line 1\nLine 2');
    expect(parsed.steps).toEqual(['a']);
  });

  it('ignores text around the object and code fences', () => {
    expect(parseModelJson('Sure!\n```json\n{"type":"chat","content":"Ok"}\n```').content).toBe('Ok');
  });

  it('recovers the content from badly broken JSON', () => {
    const raw = '{"type":"chat","content":"Day 1: beach\\nDay 2: hills", "steps": [unquoted]}';
    expect(parseModelJson(raw).content).toBe('Day 1: beach\nDay 2: hills');
  });

  it('treats plain text as the answer', () => {
    expect(parseModelJson('Just some advice.').content).toBe('Just some advice.');
  });

  it('throws when nothing is readable', () => {
    expect(() => parseModelJson('{"type":')).toThrow();
  });
});
