/**
 * Graph Renderer — SVG output for mathematical expressions
 * Uses the calculator engine to evaluate expressions over a range.
 */

import { evaluate } from './calculator.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

/**
 * Render a mathematical expression as an SVG graph.
 * @param {string} expression - Math expression using 'x' as the variable
 * @param {Object} options
 * @param {number} [options.xMin=-10] - Left bound
 * @param {number} [options.xMax=10] - Right bound
 * @param {number} [options.yMin=-10] - Bottom bound
 * @param {number} [options.yMax=10] - Top bound
 * @param {number} [options.width=800] - SVG width in pixels
 * @param {number} [options.height=600] - SVG height in pixels
 * @param {string} options.outputPath - Where to write the SVG file
 * @returns {{ path: string }}
 */
export async function graph(expression, options = {}) {
  const {
    xMin = -10,
    xMax = 10,
    yMin = -10,
    yMax = 10,
    width = 800,
    height = 600,
    outputPath,
  } = options;

  if (!outputPath) throw new Error('outputPath is required');

  // Security: validate outputPath stays within cwd to prevent path traversal
  const cwd = process.cwd();
  const resolved = isAbsolute(outputPath) ? resolve(outputPath) : resolve(cwd, outputPath);
  const rel = relative(cwd, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`outputPath must be within the current working directory (got: ${outputPath})`);
  }

  const padding = { top: 30, right: 30, bottom: 40, left: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Coordinate transforms
  const toSvgX = (x) => padding.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const toSvgY = (y) => padding.top + ((yMax - y) / (yMax - yMin)) * plotH;

  // Sample points
  const numPoints = Math.max(plotW * 2, 400);
  const step = (xMax - xMin) / numPoints;
  const points = [];

  for (let i = 0; i <= numPoints; i++) {
    const x = xMin + i * step;
    try {
      const y = evaluate(expression, { x });
      if (isFinite(y)) {
        points.push({ x, y, valid: true });
      } else {
        points.push({ x, y: 0, valid: false });
      }
    } catch {
      points.push({ x, y: 0, valid: false });
    }
  }

  // Build SVG path segments (break on invalid points)
  let pathData = '';
  let drawing = false;
  for (const pt of points) {
    if (!pt.valid || pt.y < yMin - (yMax - yMin) || pt.y > yMax + (yMax - yMin)) {
      drawing = false;
      continue;
    }
    const sx = toSvgX(pt.x).toFixed(2);
    const sy = toSvgY(pt.y).toFixed(2);
    if (!drawing) {
      pathData += `M${sx},${sy} `;
      drawing = true;
    } else {
      pathData += `L${sx},${sy} `;
    }
  }

  // Grid lines
  let gridLines = '';
  const xStep = niceStep(xMax - xMin, 10);
  const yStep = niceStep(yMax - yMin, 10);

  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    const sx = toSvgX(x).toFixed(2);
    gridLines += `<line x1="${sx}" y1="${padding.top}" x2="${sx}" y2="${height - padding.bottom}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    gridLines += `<text x="${sx}" y="${height - padding.bottom + 15}" text-anchor="middle" font-size="11" fill="#666">${fmtNum(x)}</text>\n`;
  }
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    const sy = toSvgY(y).toFixed(2);
    gridLines += `<line x1="${padding.left}" y1="${sy}" x2="${width - padding.right}" y2="${sy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    gridLines += `<text x="${padding.left - 8}" y="${parseFloat(sy) + 4}" text-anchor="end" font-size="11" fill="#666">${fmtNum(y)}</text>\n`;
  }

  // Axes
  const originX = toSvgX(0).toFixed(2);
  const originY = toSvgY(0).toFixed(2);
  const showYAxis = xMin <= 0 && xMax >= 0;
  const showXAxis = yMin <= 0 && yMax >= 0;

  let axes = '';
  if (showYAxis) {
    axes += `<line x1="${originX}" y1="${padding.top}" x2="${originX}" y2="${height - padding.bottom}" stroke="#333" stroke-width="1.5"/>\n`;
  }
  if (showXAxis) {
    axes += `<line x1="${padding.left}" y1="${originY}" x2="${width - padding.right}" y2="${originY}" stroke="#333" stroke-width="1.5"/>\n`;
  }

  // Title
  const title = `<text x="${width / 2}" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="#333">y = ${escapeXml(expression)}</text>`;

  // Assemble SVG
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <clipPath id="plot-area">
    <rect x="${padding.left}" y="${padding.top}" width="${plotW}" height="${plotH}"/>
  </clipPath>
  ${title}
  ${gridLines}
  ${axes}
  <g clip-path="url(#plot-area)">
    <path d="${pathData.trim()}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>
  </g>
  <rect x="${padding.left}" y="${padding.top}" width="${plotW}" height="${plotH}" fill="none" stroke="#ccc" stroke-width="1"/>
</svg>`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, svg, 'utf-8');

  return { path: outputPath };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function niceStep(range, maxTicks) {
  const rough = range / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let nice;
  if (norm <= 1.5) nice = 1;
  else if (norm <= 3) nice = 2;
  else if (norm <= 7) nice = 5;
  else nice = 10;
  return nice * mag;
}

function fmtNum(n) {
  if (Math.abs(n) < 1e-10) return '0';
  if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0)) return n.toExponential(1);
  return parseFloat(n.toFixed(4)).toString();
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
