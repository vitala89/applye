import ts from 'typescript';

/**
 * Comment-aware line counting for the file-size budget gate. The budget exists
 * to pressure decomposition when logic or responsibility grows too large to
 * review; a comment documents existing complexity rather than adding it, and
 * this project's own quality contract requires "why, not what" comments -
 * counting them against the same budget that demands them was a direct
 * contradiction. Each masker below blanks a language's comments (and, where
 * needed, its string/char literals so a comment-like sequence inside one is
 * left alone) while keeping every newline in place, so the caller can count
 * non-empty lines on the masked text exactly as it did on the raw source.
 */

export function effectiveLineCount(content) {
  return content.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

/**
 * Blank a byte range in place, keeping every newline so line numbers survive.
 * Shared by every language masker below.
 */
function blanker(chars) {
  return (from, to) => {
    for (let k = from; k < to && k < chars.length; k += 1) {
      if (chars[k] !== '\n') chars[k] = ' ';
    }
  };
}

/**
 * Blank TypeScript/JavaScript comments via the real compiler scanner rather than
 * a regex, so a `//` or `/*` inside a string, template literal, or regex literal
 * is never mistaken for a comment. `split('')` keeps offsets in UTF-16 code
 * units to match the scanner's own positions - `Array.from` would desync on any
 * astral character (e.g. an emoji in a UI string).
 */
export function maskTypeScript(source) {
  const out = source.split('');
  const blank = blanker(out);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      blank(scanner.getTokenPos(), scanner.getTextPos());
    }
    token = scanner.scan();
  }
  return out.join('');
}

/**
 * Blank `//` and `/* *\/` comments in SCSS/CSS, skipping quoted strings first so
 * a comment-like sequence inside `content: "//"` or a `url("...")` is left
 * alone. Plain CSS has no `//` comment, but treating it the same as SCSS is
 * harmless - the sequence cannot appear outside a string or an actual comment.
 */
export function maskCLike(source) {
  const out = source.split('');
  const blank = blanker(out);
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      let j = i + 1;
      while (j < source.length && source[j] !== quote) j += source[j] === '\\' ? 2 : 1;
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/** Blank `<!-- -->` comments in Angular templates. */
export function maskHtml(source) {
  const out = source.split('');
  const blank = blanker(out);
  let i = 0;
  while (i < source.length) {
    if (source.slice(i, i + 4) === '<!--') {
      const end = source.indexOf('-->', i + 4);
      const stop = end === -1 ? source.length : end + 3;
      blank(i, stop);
      i = stop;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Blank out comments and literal contents, keeping every newline in place, so
 * braces and `#[cfg(test)]` can be found without a `{` inside a JSON fixture
 * string closing a module early. Rust needs the awkward cases handled: nested
 * block comments, raw strings with any number of hashes, and `'a` lifetimes,
 * which look like an unterminated char literal to a naive scanner.
 */
export function maskRust(source) {
  const out = source.split('');
  const blank = blanker(out);
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === '/*') {
      let depth = 1;
      let j = i + 2;
      while (j < source.length && depth > 0) {
        if (source.slice(j, j + 2) === '/*') {
          depth += 1;
          j += 2;
        } else if (source.slice(j, j + 2) === '*/') {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      blank(i, j);
      i = j;
      continue;
    }
    // Raw string: r, br, or rb followed by hashes and a quote.
    const raw = /^(?:b?r|rb)(#*)"/.exec(source.slice(i, i + 16));
    if (raw) {
      const close = `"${raw[1]}`;
      const start = i + raw[0].length;
      const end = source.indexOf(close, start);
      const stop = end === -1 ? source.length : end + close.length;
      blank(start, end === -1 ? source.length : end);
      i = stop;
      continue;
    }
    if (source[i] === '"' || (source[i] === 'b' && source[i + 1] === '"')) {
      let j = source[i] === '"' ? i + 1 : i + 2;
      while (j < source.length && source[j] !== '"') j += source[j] === '\\' ? 2 : 1;
      blank(i, j);
      i = j + 1;
      continue;
    }
    if (source[i] === "'") {
      // A char literal closes within a few characters; anything else is a
      // lifetime and must not swallow the rest of the file.
      const rest = source.slice(i, i + 8);
      const ch = /^'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]{1,6}\}|.)|[^'\\])'/.exec(rest);
      if (ch) {
        blank(i, i + ch[0].length);
        i += ch[0].length;
      } else {
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Line numbers (0-based) belonging to `#[cfg(test)]` items, given already-masked
 * Rust source. Inline test modules are the Rust convention, so counting them
 * against the source budget would measure a well-tested module as a bloated
 * one and quietly push tests out of the file they belong to.
 */
export function rustTestLines(masked) {
  const lineOf = [];
  let line = 0;
  for (const ch of masked) {
    lineOf.push(line);
    if (ch === '\n') line += 1;
  }
  const marked = new Set();
  const attr = /#\[cfg\(test\)\]/g;
  let match;
  while ((match = attr.exec(masked)) !== null) {
    const j = masked.indexOf('{', match.index);
    if (j === -1) break;
    let depth = 0;
    let k = j;
    for (; k < masked.length; k += 1) {
      if (masked[k] === '{') depth += 1;
      else if (masked[k] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    for (let p = match.index; p <= Math.min(k, masked.length - 1); p += 1) marked.add(lineOf[p]);
    attr.lastIndex = k;
  }
  return marked;
}

/** Picks the masker for a file's language; unrecognized extensions pass through unmasked. */
export function maskFor(file, content) {
  if (file.endsWith('.rs')) return maskRust(content);
  if (/\.(?:scss|css)$/.test(file)) return maskCLike(content);
  if (file.endsWith('.html')) return maskHtml(content);
  if (/\.[cm]?[jt]sx?$/.test(file)) return maskTypeScript(content);
  return content;
}
