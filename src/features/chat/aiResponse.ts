/**
 * Reads the JSON object Gemini returns. Long answers occasionally come back slightly broken
 * (for example `Cox\'s`, an escape JSON doesn't allow, or text around the object), so this tries
 * a few gentle repairs before giving up, and as a last resort pulls out just the "content" text.
 */
export function parseModelJson(raw: string): any {
  const text = raw.replace(/```json|```/g, '').trim();

  const attempts = [
    text,
    // Only the outermost {...}, in case there's chatter before or after it
    text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
  ];

  for (const candidate of attempts) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch { /* try a repaired copy */ }
    try { return JSON.parse(repair(candidate)); } catch { /* next attempt */ }
  }

  // Last resort: recover the answer text so the user still sees a reply
  const content = text.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/s)?.[1];
  if (content !== undefined) {
    return { type: 'chat', content: unescapeLoosely(content) };
  }
  // Plain text that isn't JSON at all is still a usable answer
  if (text && !text.startsWith('{')) return { type: 'chat', content: text };

  throw new Error('Unreadable AI response');
}

/** Fixes the mistakes models make most often inside JSON strings */
function repair(json: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (ch === '\\') {
        const next = json[i + 1];
        if (next !== undefined && '"\\/bfnrtu'.includes(next)) {
          out += ch + next; // a valid escape: keep it
        } else if (next !== undefined) {
          out += next; // an invalid escape like \' : drop the backslash
        }
        i++;
        continue;
      }
      if (ch === '"') { inString = false; out += ch; continue; }
      // Raw line breaks and tabs aren't allowed inside JSON strings
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') continue;
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  // A trailing comma before } or ] is another common slip
  return out.replace(/,\s*([}\]])/g, '$1');
}

function unescapeLoosely(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}
