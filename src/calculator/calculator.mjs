/**
 * Calculator Engine — Expression parser and evaluator
 * No external libraries. Tokenizer → Recursive Descent Parser → AST Evaluator.
 */

// ─── Token Types ───────────────────────────────────────────────────────────────
const TokenType = {
  NUMBER: 'NUMBER',
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  STAR: 'STAR',
  SLASH: 'SLASH',
  PERCENT: 'PERCENT',
  CARET: 'CARET',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  IDENT: 'IDENT',
  EOF: 'EOF',
};

// ─── Tokenizer ─────────────────────────────────────────────────────────────────
function tokenize(input) {
  const tokens = [];
  let i = 0;
  const src = input.replace(/\s+/g, '');

  while (i < src.length) {
    const ch = src[i];

    // Numbers (including decimals)
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      let hasDot = false;
      while (i < src.length && ((src[i] >= '0' && src[i] <= '9') || src[i] === '.')) {
        if (src[i] === '.') {
          if (hasDot) throw new Error(`Invalid number at position ${i}`);
          hasDot = true;
        }
        num += src[i++];
      }
      tokens.push({ type: TokenType.NUMBER, value: parseFloat(num) });
      continue;
    }

    // Identifiers (function names or variable 'x')
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let ident = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) {
        ident += src[i++];
      }
      tokens.push({ type: TokenType.IDENT, value: ident });
      continue;
    }

    switch (ch) {
      case '+': tokens.push({ type: TokenType.PLUS }); break;
      case '-': tokens.push({ type: TokenType.MINUS }); break;
      case '*': tokens.push({ type: TokenType.STAR }); break;
      case '/': tokens.push({ type: TokenType.SLASH }); break;
      case '%': tokens.push({ type: TokenType.PERCENT }); break;
      case '^': tokens.push({ type: TokenType.CARET }); break;
      case '(': tokens.push({ type: TokenType.LPAREN }); break;
      case ')': tokens.push({ type: TokenType.RPAREN }); break;
      case ',': tokens.push({ type: TokenType.COMMA }); break;
      default:
        throw new Error(`Unexpected character '${ch}' at position ${i}`);
    }
    i++;
  }

  tokens.push({ type: TokenType.EOF });
  return tokens;
}

// ─── Parser (Recursive Descent) ────────────────────────────────────────────────
// Grammar:
//   expr       → term (('+' | '-') term)*
//   term       → unary (('*' | '/' | '%') unary)*
//   unary      → ('-' | '+') unary | power
//   power      → call ('^' power)?          // right-associative
//   call       → IDENT '(' args ')' | atom
//   atom       → NUMBER | IDENT | '(' expr ')'
//   args       → expr (',' expr)*

function parse(tokens) {
  let pos = 0;

  function peek() { return tokens[pos]; }
  function consume(expectedType) {
    const tok = tokens[pos];
    if (expectedType && tok.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${tok.type} at token ${pos}`);
    }
    pos++;
    return tok;
  }

  function expr() {
    let node = term();
    while (peek().type === TokenType.PLUS || peek().type === TokenType.MINUS) {
      const op = consume().type === TokenType.PLUS ? '+' : '-';
      const right = term();
      node = { type: 'BinaryOp', op, left: node, right };
    }
    return node;
  }

  function term() {
    let node = unary();
    while (peek().type === TokenType.STAR || peek().type === TokenType.SLASH || peek().type === TokenType.PERCENT) {
      const op = consume();
      const opStr = op.type === TokenType.STAR ? '*' : op.type === TokenType.SLASH ? '/' : '%';
      const right = unary();
      node = { type: 'BinaryOp', op: opStr, left: node, right };
    }
    return node;
  }

  function unary() {
    if (peek().type === TokenType.MINUS) {
      consume();
      const operand = unary();
      return { type: 'UnaryOp', op: '-', operand };
    }
    if (peek().type === TokenType.PLUS) {
      consume();
      return unary();
    }
    return power();
  }

  function power() {
    let base = call();
    if (peek().type === TokenType.CARET) {
      consume();
      const exp = power(); // right-associative
      base = { type: 'BinaryOp', op: '^', left: base, right: exp };
    }
    return base;
  }

  function call() {
    if (peek().type === TokenType.IDENT) {
      const name = peek().value;
      // Check if next token is '(' — it's a function call
      if (pos + 1 < tokens.length && tokens[pos + 1].type === TokenType.LPAREN) {
        consume(TokenType.IDENT);
        consume(TokenType.LPAREN);
        const args = [];
        if (peek().type !== TokenType.RPAREN) {
          args.push(expr());
          while (peek().type === TokenType.COMMA) {
            consume();
            args.push(expr());
          }
        }
        consume(TokenType.RPAREN);
        return { type: 'Call', name, args };
      }
      // Otherwise it's a variable reference
      consume(TokenType.IDENT);
      return { type: 'Variable', name };
    }
    return atom();
  }

  function atom() {
    if (peek().type === TokenType.NUMBER) {
      const tok = consume(TokenType.NUMBER);
      return { type: 'Number', value: tok.value };
    }
    if (peek().type === TokenType.LPAREN) {
      consume(TokenType.LPAREN);
      const node = expr();
      consume(TokenType.RPAREN);
      return node;
    }
    if (peek().type === TokenType.IDENT) {
      const tok = consume(TokenType.IDENT);
      return { type: 'Variable', name: tok.value };
    }
    throw new Error(`Unexpected token ${peek().type} at position ${pos}`);
  }

  const ast = expr();
  if (peek().type !== TokenType.EOF) {
    throw new Error(`Unexpected token after expression: ${peek().type}`);
  }
  return ast;
}

// ─── Evaluator ─────────────────────────────────────────────────────────────────
const FUNCTIONS = {
  sin:   ([x]) => Math.sin(x),
  cos:   ([x]) => Math.cos(x),
  tan:   ([x]) => Math.tan(x),
  asin:  ([x]) => Math.asin(x),
  acos:  ([x]) => Math.acos(x),
  atan:  ([x]) => Math.atan(x),
  log:   ([x]) => Math.log10(x),
  ln:    ([x]) => Math.log(x),
  exp:   ([x]) => Math.exp(x),
  sqrt:  ([x]) => Math.sqrt(x),
  abs:   ([x]) => Math.abs(x),
  factorial: ([x]) => {
    if (x < 0 || !Number.isInteger(x)) throw new Error('factorial requires a non-negative integer');
    if (x > 170) return Infinity;
    let result = 1;
    for (let i = 2; i <= x; i++) result *= i;
    return result;
  },
};

function evaluateAST(node, vars = {}) {
  switch (node.type) {
    case 'Number':
      return node.value;

    case 'Variable':
      if (node.name in vars) return vars[node.name];
      if (node.name === 'e') return Math.E;
      if (node.name === 'pi' || node.name === 'PI') return Math.PI;
      throw new Error(`Undefined variable: ${node.name}`);

    case 'UnaryOp':
      if (node.op === '-') return -evaluateAST(node.operand, vars);
      throw new Error(`Unknown unary operator: ${node.op}`);

    case 'BinaryOp': {
      const l = evaluateAST(node.left, vars);
      const r = evaluateAST(node.right, vars);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/':
          if (r === 0) throw new Error('Division by zero');
          return l / r;
        case '%':
          if (r === 0) throw new Error('Modulo by zero');
          return l % r;
        case '^': return Math.pow(l, r);
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
    }

    case 'Call': {
      const fn = FUNCTIONS[node.name.toLowerCase()];
      if (!fn) throw new Error(`Unknown function: ${node.name}`);
      const argValues = node.args.map(a => evaluateAST(a, vars));
      return fn(argValues);
    }

    default:
      throw new Error(`Unknown AST node type: ${node.type}`);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a mathematical expression string.
 * @param {string} expression - e.g. "2 + 3 * sin(pi/4)"
 * @param {Object} [vars] - Variable bindings, e.g. { x: 5 }
 * @returns {number}
 */
export function evaluate(expression, vars = {}) {
  const tokens = tokenize(expression);
  const ast = parse(tokens);
  return evaluateAST(ast, vars);
}
