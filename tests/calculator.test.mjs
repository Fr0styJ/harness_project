import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/calculator/calculator.mjs';
import { graph } from '../src/calculator/graph.mjs';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EPSILON = 1e-9;

function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${msg}: expected ${expected}, got ${actual}`);
}

describe('Calculator - Basic Arithmetic', () => {
  it('addition', () => approx(evaluate('2 + 2'), 4, '2+2'));
  it('subtraction', () => approx(evaluate('10 - 3'), 7, '10-3'));
  it('multiplication', () => approx(evaluate('6 * 7'), 42, '6*7'));
  it('division', () => approx(evaluate('10 / 2'), 5, '10/2'));
  it('modulo', () => approx(evaluate('17 % 5'), 2, '17%5'));
  it('exponentiation', () => approx(evaluate('2 ^ 10'), 1024, '2^10'));
  it('negative numbers', () => approx(evaluate('-5 + 3'), -2, '-5+3'));
  it('unary minus', () => approx(evaluate('-(3 + 2)'), -5, '-(3+2)'));
});

describe('Calculator - Order of Operations', () => {
  it('PEMDAS: 2 + 3 * 4', () => approx(evaluate('2 + 3 * 4'), 14, 'pemdas'));
  it('parentheses: (2 + 3) * 4', () => approx(evaluate('(2 + 3) * 4'), 20, 'parens'));
  it('nested: ((2 + 3) * (4 - 1))', () => approx(evaluate('((2 + 3) * (4 - 1))'), 15, 'nested'));
  it('power right-assoc: 2^2^3', () => approx(evaluate('2^2^3'), 256, 'power-assoc'));
});

describe('Calculator - Advanced Functions', () => {
  it('sin(0)', () => approx(evaluate('sin(0)'), 0, 'sin(0)'));
  it('cos(0)', () => approx(evaluate('cos(0)'), 1, 'cos(0)'));
  it('tan(0)', () => approx(evaluate('tan(0)'), 0, 'tan(0)'));
  it('sin(pi/2)', () => approx(evaluate('sin(pi/2)'), 1, 'sin(pi/2)'));
  it('asin(1)', () => approx(evaluate('asin(1)'), Math.PI / 2, 'asin(1)'));
  it('acos(1)', () => approx(evaluate('acos(1)'), 0, 'acos(1)'));
  it('atan(0)', () => approx(evaluate('atan(0)'), 0, 'atan(0)'));
  it('sqrt(16)', () => approx(evaluate('sqrt(16)'), 4, 'sqrt(16)'));
  it('sqrt(2)', () => approx(evaluate('sqrt(2)'), Math.SQRT2, 'sqrt(2)'));
  it('log(100)', () => approx(evaluate('log(100)'), 2, 'log(100)'));
  it('ln(e)', () => approx(evaluate('ln(e)'), 1, 'ln(e)'));
  it('exp(0)', () => approx(evaluate('exp(0)'), 1, 'exp(0)'));
  it('exp(1)', () => approx(evaluate('exp(1)'), Math.E, 'exp(1)'));
  it('abs(-7)', () => approx(evaluate('abs(-7)'), 7, 'abs(-7)'));
  it('factorial(0)', () => approx(evaluate('factorial(0)'), 1, 'fact(0)'));
  it('factorial(5)', () => approx(evaluate('factorial(5)'), 120, 'fact(5)'));
  it('factorial(10)', () => approx(evaluate('factorial(10)'), 3628800, 'fact(10)'));
});

describe('Calculator - Variables', () => {
  it('x substitution', () => approx(evaluate('x + 1', { x: 5 }), 6, 'x+1'));
  it('x^2 + 2*x + 1 at x=3', () => approx(evaluate('x^2 + 2*x + 1', { x: 3 }), 16, 'quadratic'));
  it('sin(x) at x=pi', () => approx(evaluate('sin(x)', { x: Math.PI }), 0, 'sin(pi)'));
});

describe('Calculator - Error Handling', () => {
  it('division by zero throws', () => assert.throws(() => evaluate('1/0'), /Division by zero/));
  it('unknown function throws', () => assert.throws(() => evaluate('foo(1)'), /Unknown function/));
  it('undefined variable throws', () => assert.throws(() => evaluate('y + 1'), /Undefined variable/));
  it('invalid character throws', () => assert.throws(() => evaluate('2 & 3'), /Unexpected character/));
});

describe('Graph - SVG Generation', () => {
  const testSvgPath = join(tmpdir(), `harness-test-graph-${Date.now()}.svg`);

  it('generates an SVG file', async () => {
    const result = await graph('sin(x)', {
      xMin: -Math.PI * 2,
      xMax: Math.PI * 2,
      outputPath: testSvgPath,
    });
    assert.equal(result.path, testSvgPath);
    assert.ok(existsSync(testSvgPath), 'SVG file should exist');
  });

  it('SVG contains expected elements', async () => {
    const { readFileSync } = await import('node:fs');
    const svg = readFileSync(testSvgPath, 'utf-8');
    assert.ok(svg.includes('<svg'), 'should have svg tag');
    assert.ok(svg.includes('<path'), 'should have path element');
    assert.ok(svg.includes('sin(x)'), 'should have title with expression');
  });

  it('cleans up test file', () => {
    if (existsSync(testSvgPath)) unlinkSync(testSvgPath);
  });
});
