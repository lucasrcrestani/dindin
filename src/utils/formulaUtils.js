/**
 * Safe arithmetic expression parser.
 * Supports: +, -, *, /, parentheses, unary minus, integers and decimals.
 * Both '.' and ',' are accepted as decimal separators.
 * Does NOT use eval().
 *
 * @param {string|number} val - Raw formula string or a legacy numeric value.
 * @returns {number|null} The computed result, or null if the input is invalid.
 */
function parseFormula(val) {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val !== 'string' || !val.trim()) return null;

  // Normalise decimal separator: replace ',' with '.' only when it looks like a
  // decimal separator (digit on both sides), so "1,5 + 2" → "1.5 + 2".
  const src = val.replace(/(\d),(\d)/g, '$1.$2');

  let pos = 0;

  function skipSpaces() {
    while (pos < src.length && src[pos] === ' ') pos++;
  }

  function parseExpr() {
    let left = parseTerm();
    if (left === null) return null;
    while (true) {
      skipSpaces();
      if (pos < src.length && (src[pos] === '+' || src[pos] === '-')) {
        const op = src[pos++];
        const right = parseTerm();
        if (right === null) return null;
        left = op === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    if (left === null) return null;
    while (true) {
      skipSpaces();
      if (pos < src.length && (src[pos] === '*' || src[pos] === '/')) {
        const op = src[pos++];
        const right = parseFactor();
        if (right === null) return null;
        if (op === '/' && right === 0) return null; // division by zero
        left = op === '*' ? left * right : left / right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseFactor() {
    skipSpaces();
    if (pos >= src.length) return null;

    // Unary minus
    if (src[pos] === '-') {
      pos++;
      const inner = parseFactor();
      return inner === null ? null : -inner;
    }

    // Unary plus
    if (src[pos] === '+') {
      pos++;
      return parseFactor();
    }

    // Parenthesised expression
    if (src[pos] === '(') {
      pos++; // consume '('
      const inner = parseExpr();
      skipSpaces();
      if (pos >= src.length || src[pos] !== ')') return null; // missing closing paren
      pos++; // consume ')'
      return inner;
    }

    // Number literal
    const start = pos;
    while (pos < src.length && /[\d.]/.test(src[pos])) pos++;
    if (pos === start) return null; // no digits consumed
    const num = parseFloat(src.slice(start, pos));
    return isNaN(num) ? null : num;
  }

  const result = parseExpr();
  skipSpaces();

  // If we didn't consume the entire string, the expression was invalid.
  if (pos !== src.length) return null;
  return result === null || isNaN(result) ? null : result;
}

export { parseFormula };
