# Calculator Module

A fully-featured calculator with graphing, built from scratch with no external math libraries.

## Calculator Engine

```js
import { evaluate } from './calculator.mjs';

evaluate('2 + 3 * 4');           // 14
evaluate('(2 + 3) * 4');         // 20
evaluate('sin(pi/4)');           // 0.7071...
evaluate('sqrt(16) + ln(e)');    // 5
evaluate('factorial(5)');        // 120
evaluate('x^2 + 2*x + 1', { x: 3 }); // 16
```

### Supported Operations

| Category | Functions |
|----------|-----------|
| Basic | `+`, `-`, `*`, `/`, `%`, `^`, parentheses |
| Trig | `sin`, `cos`, `tan`, `asin`, `acos`, `atan` (radians) |
| Logarithmic | `log` (base 10), `ln` (natural), `exp` |
| Other | `sqrt`, `abs`, `factorial` |
| Constants | `pi`, `e` |
| Variables | Any name via second argument, especially `x` for graphing |

## Graphing

```js
import { graph } from './graph.mjs';

await graph('sin(x) * x', {
  xMin: -10,
  xMax: 10,
  outputPath: 'output/graph.svg'
});

await graph('x^2 - 4', {
  xMin: -5, xMax: 5,
  yMin: -5, yMax: 10,
  width: 800, height: 600,
  outputPath: 'output/parabola.svg'
});
```

Outputs a self-contained SVG with axes, grid lines, labels, and the plotted curve.
