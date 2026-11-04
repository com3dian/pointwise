import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STYLES, LINE_STYLES, CORNER_STYLES, normalizeDefaults, effectiveLine, effectiveNode, lineUsesDefaults, crossUsesDefaults } from '../dist/styles.js';

test('safe map defaults support every corner and line pattern and keep zero radius', () => {
  assert.deepEqual(normalizeDefaults(), DEFAULT_STYLES);
  for (const { id: style } of LINE_STYLES) assert.equal(normalizeDefaults({ style }).style, style);
  for (const { id: cornerStyle } of CORNER_STYLES) assert.equal(normalizeDefaults({ cornerStyle }).cornerStyle, cornerStyle);
  const bounded = normalizeDefaults({ width: 100, cornerRadius: -50, crossWidth: 1, crossSize: 100, crossLength: Infinity, style: '<script>' });
  assert.equal(bounded.width, 24);
  assert.equal(bounded.cornerRadius, 0);
  assert.equal(bounded.crossWidth, 6);
  assert.equal(bounded.crossSize, 3);
  assert.equal(bounded.crossLength, 28);
  assert.equal(bounded.style, 'solid');
  assert.equal(normalizeDefaults({ cornerRadius: 0 }).cornerRadius, 0);
});

test('global routes follow later default changes while local routes retain their own appearance', () => {
  const source = { id: 'line', color: '#123456', nodeIds: ['a', 'b'], styleMode: 'global', style: 'dashed', width: 12 };
  const map = { defaults: { style: 'triple', width: 18, cornerStyle: 'circular', cornerRadius: 44, routing: 'orthogonal' } };
  const inherited = effectiveLine(map, source);
  assert.equal(inherited.style, 'triple');
  assert.equal(inherited.width, 18);
  assert.equal(inherited.cornerStyle, 'circular');
  assert.equal(inherited.routing, 'orthogonal');
  assert.equal(inherited.color, '#123456');
  assert.deepEqual(inherited.nodeIds, ['a', 'b']);
  const local = effectiveLine(map, { ...source, styleMode: 'custom', cornerStyle: 'bevel', cornerRadius: 0 });
  assert.equal(local.style, 'dashed');
  assert.equal(local.width, 12);
  assert.equal(local.cornerStyle, 'bevel');
  assert.equal(local.cornerRadius, 0);
  assert.equal(local.routing, 'octilinear');
  assert.equal(source.style, 'dashed');
});

test('legacy default routes join shared styles but edited legacy routes remain local', () => {
  assert.equal(lineUsesDefaults({}, { width: 8, style: 'solid', cornerRadius: 20 }), true);
  assert.equal(lineUsesDefaults({}, { width: 6, style: 'solid', cornerRadius: 20 }), true);
  assert.equal(lineUsesDefaults({}, { width: 12, style: 'solid', cornerRadius: 20 }), false);
  assert.equal(lineUsesDefaults({}, { width: 8, style: 'dashed', cornerRadius: 20 }), false);
  assert.equal(lineUsesDefaults({}, { cornerRadius: 0 }), false);
  assert.equal(lineUsesDefaults({}, { styleMode: 'global', cornerRadius: 0 }), true);
  assert.equal(lineUsesDefaults({}, { styleMode: 'custom' }), false);
});

test('crosses inherit appearance without replacing their local rotation or manually fitted arms', () => {
  const node = { id: 'station', x: 20, y: 30, symbol: 'cross', crossStyleMode: 'global', symbolAngle: 27, symbolCrossMode: 'manual', symbolCrossArms: [{ angle: -135, length: 29 }, { angle: 45, length: 17 }] };
  const map = { defaults: { crossSize: 2, crossLength: 50, crossWidth: 16, crossOutline: 'line', crossFill: 'transparent', cornerStyle: 'bevel' } };
  const resolved = effectiveNode(map, node);
  assert.equal(resolved.symbolSize, 2);
  assert.equal(resolved.symbolLength, 50);
  assert.equal(resolved.symbolArmWidth, 16);
  assert.equal(resolved.symbolOutline, 'line');
  assert.equal(resolved.symbolFill, 'transparent');
  assert.equal(resolved.symbolCornerStyle, 'bevel');
  assert.equal(resolved.symbolAngle, 27);
  assert.equal(resolved.symbolCrossMode, 'manual');
  assert.deepEqual(resolved.symbolCrossArms, node.symbolCrossArms);
  assert.equal(node.symbolSize, undefined);
});

test('local crosses override global appearance while non-cross symbols retain their own fields', () => {
  const map = { defaults: { crossSize: 3, crossWidth: 24, crossCornerStyle: 'sharp', cornerStyle: 'circular' } };
  const custom = { symbol: 'cross', crossStyleMode: 'custom', symbolSize: 1.4, symbolArmWidth: 8, symbolCornerStyle: 'rounded', symbolFill: 'paper' };
  assert.equal(effectiveNode(map, custom).symbolSize, 1.4);
  assert.equal(effectiveNode(map, custom).symbolArmWidth, 8);
  assert.equal(effectiveNode(map, custom).symbolCornerStyle, 'rounded');
  const capsule = { ...custom, symbol: 'capsule', symbolLength: 46 };
  assert.deepEqual(effectiveNode(map, capsule), capsule);
  assert.equal(crossUsesDefaults({}, { symbol: 'cross', symbolSize: 1, symbolArmWidth: 10 }), true);
  assert.equal(crossUsesDefaults({}, { symbol: 'cross', symbolSize: 1.4 }), false);
  assert.equal(effectiveNode(map, { symbol: 'cross', crossStyleMode: 'global' }).symbolCornerStyle, 'sharp');
});
