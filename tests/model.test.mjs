import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMap } from '../dist/model.js';

const fixture = () => ({
  version: 1, title: 'An old map', subtitle: 'Before appearance controls', theme: 'paper',
  nodes: [{ id: 'a', x: 0, y: 10, name: 'First stop' }, { id: 'b', x: 60, y: 40, name: 'Second stop' }],
  lines: [{ id: 'route', name: 'Route', code: '01', color: '#AABBCC', nodeIds: ['a', 'b'] }],
});

test('older version-1 maps gain appearance defaults without moving or disconnecting stops', () => {
  const result = validateMap(fixture());
  assert.equal(result.lines[0].cornerRadius, 20);
  assert.deepEqual(result.lines[0].nodeIds, ['a', 'b']);
  assert.deepEqual(result.nodes.map(({ x, y }) => [x, y]), [[0, 10], [60, 40]]);
  assert.equal(result.nodes[0].symbol, 'auto');
  assert.equal(result.nodes[0].symbolAngle, 0);
  assert.equal(result.nodes[0].symbolSize, 1);
  assert.equal(result.nodes[0].symbolLength, 28);
  assert.equal(result.nodes[0].symbolOutline, 'ink');
  assert.equal(result.nodes[0].symbolFill, 'paper');
  assert.equal(result.nodes[0].symbolCrossMode, 'auto');
  assert.ok(Array.isArray(result.nodes[0].symbolCrossArms));
  assert.equal(result.lines[0].styleMode, 'global');
  assert.equal(result.nodes[0].crossStyleMode, 'global');
  assert.equal(result.defaults.style, 'solid');
});

test('all station presets and their controls survive JSON save and reload', () => {
  const shapes = ['auto', 'circle', 'disc', 'capsule', 'open-capsule', 'pill-dots', 'linked', 'linked-dots', 'double-circle', 'cross', 'segmented-ring', 'orbital'];
  const source = fixture();
  source.nodes = shapes.map((symbol, index) => ({
    id: `stop-${index}`, x: index * 40, y: 20, name: symbol, symbol,
    symbolAngle: 45, symbolSize: 1.7, symbolLength: 42, symbolOutline: 'line', symbolFill: 'transparent',
  }));
  source.lines[0].nodeIds = source.nodes.map(n => n.id);
  source.lines[0].cornerRadius = 0;
  const normalized = validateMap(source);
  const restored = validateMap(JSON.parse(JSON.stringify(normalized)));
  assert.deepEqual(restored, normalized);
  assert.deepEqual(restored.nodes.map(n => n.symbol), shapes);
  assert.ok(restored.nodes.every(n => n.symbolAngle === 45 && n.symbolSize === 1.7 && n.symbolLength === 42));
  assert.ok(restored.nodes.every(n => n.symbolOutline === 'line' && n.symbolFill === 'transparent'));
  assert.equal(restored.lines[0].cornerRadius, 0);
});

test('appearance values are bounded and unsupported values fall back safely', () => {
  const source = fixture();
  Object.assign(source.nodes[0], { symbol: '<script>', symbolAngle: 10000, symbolSize: -2, symbolLength: 10000, symbolOutline: 'red', symbolFill: 'url(evil)' });
  source.lines[0].cornerRadius = 10000;
  const result = validateMap(source);
  assert.equal(result.nodes[0].symbol, 'auto');
  assert.ok(result.nodes[0].symbolAngle >= -180 && result.nodes[0].symbolAngle <= 180);
  assert.equal(result.nodes[0].symbolSize, 0.6);
  assert.equal(result.nodes[0].symbolLength, 60);
  assert.equal(result.nodes[0].symbolOutline, 'ink');
  assert.equal(result.nodes[0].symbolFill, 'paper');
  assert.equal(result.lines[0].cornerRadius, 160);
  source.lines[0].cornerRadius = -5;
  assert.equal(validateMap(source).lines[0].cornerRadius, 0);
  source.lines[0].cornerRadius = NaN;
  assert.equal(validateMap(source).lines[0].cornerRadius, 20);
});

test('validation rejects broken topology, repeated identifiers, and nonfinite coordinates', () => {
  const broken = fixture(); broken.lines[0].nodeIds.push('missing');
  assert.throws(() => validateMap(broken), /invalid line connections/);
  const repeated = fixture(); repeated.nodes[1].id = 'a';
  assert.throws(() => validateMap(repeated), /invalid station data/);
  const repeatedLine = fixture(); repeatedLine.lines.push({ ...repeatedLine.lines[0] });
  assert.throws(() => validateMap(repeatedLine), /invalid line connections/);
  for (const value of [NaN, Infinity, 100001, '40']) {
    const invalid = fixture(); invalid.nodes[0].x = value;
    assert.throws(() => validateMap(invalid), /invalid station data/);
  }
  const nullStation = fixture(); nullStation.nodes.push(null);
  assert.throws(() => validateMap(nullStation), /invalid station data/);
});

test('safe colors and bounded content are retained without mutating the imported object', () => {
  const source = fixture();
  source.nodes[0].name = 'N'.repeat(120);
  source.nodes[0].description = 'D'.repeat(11000);
  source.lines[0].color = 'url(javascript:evil)';
  const before = structuredClone(source);
  const result = validateMap(source);
  assert.equal(result.nodes[0].name.length, 100);
  assert.equal(result.nodes[0].description.length, 10000);
  assert.equal(result.lines[0].color, '#4068E8');
  assert.deepEqual(source, before);
  result.lines[0].nodeIds.push('a');
  assert.deepEqual(source.lines[0].nodeIds, ['a', 'b']);
});

test('invalid documents and oversized maps are rejected before processing', () => {
  for (const invalid of [null, {}, { ...fixture(), version: 2 }, { ...fixture(), nodes: {} }]) {
    assert.throws(() => validateMap(invalid), /Choose a Pointwise JSON map/);
  }
  assert.throws(() => validateMap({ ...fixture(), nodes: new Array(3001).fill(null) }), /too large/);
  assert.throws(() => validateMap({ ...fixture(), lines: new Array(151).fill(null) }), /too large/);
});

test('manually adjusted cross arms survive JSON save and reload', () => {
  const source = fixture();
  Object.assign(source.nodes[0], {
    symbol: 'cross', symbolCrossMode: 'manual', symbolAngle: 15,
    symbolCrossArms: [{ angle: -135, length: 24 }, { angle: -180, length: 18 }, { angle: 0, length: 35 }, { angle: 45, length: 21 }],
  });
  const normalized = validateMap(source);
  const restored = validateMap(JSON.parse(JSON.stringify(normalized)));
  assert.equal(restored.nodes[0].symbolCrossMode, 'manual');
  assert.deepEqual(restored.nodes[0].symbolCrossArms, normalized.nodes[0].symbolCrossArms);
  assert.equal(restored.nodes[0].symbolCrossArms.length, 4);
  assert.ok(restored.nodes[0].symbolCrossArms.some(arm => arm.angle === 45 && arm.length === 21));
  assert.ok(restored.nodes[0].symbolCrossArms.some(arm => arm.angle === 0 && arm.length === 35));
  assert.equal(restored.nodes[0].symbolAngle, 15);
});

test('invalid cross settings receive bounded safe defaults', () => {
  const source = fixture();
  Object.assign(source.nodes[0], { symbol: 'cross', symbolCrossMode: '<script>', symbolCrossArms: [{ angle: Infinity, length: 'url(evil)' }, { angle: 45, length: 10000 }] });
  const result = validateMap(source).nodes[0];
  assert.equal(result.symbolCrossMode, 'auto');
  assert.ok(result.symbolCrossArms.length <= 8);
  assert.ok(result.symbolCrossArms.every(arm => Number.isFinite(arm.angle) && arm.angle >= -180 && arm.angle <= 180 && arm.length >= 6 && arm.length <= 60));
});

test('global defaults and local style overrides survive JSON without replacing topology or arm geometry', () => {
  const source = fixture();
  source.defaults = { style: 'triple', width: 16, cornerStyle: 'circular', cornerRadius: 46, routing: 'orthogonal', crossSize: 1.8, crossWidth: 14, crossCornerStyle: 'inherit' };
  Object.assign(source.lines[0], { styleMode: 'global', style: 'solid', width: 8 });
  source.lines.push({ id: 'local', color: '#445566', nodeIds: ['a', 'b'], styleMode: 'custom', style: 'double', width: 12, cornerStyle: 'bevel', cornerRadius: 15, routing: 'octilinear' });
  Object.assign(source.nodes[0], { symbol: 'cross', crossStyleMode: 'global', symbolCrossMode: 'manual', symbolAngle: 25, symbolCrossArms: [{ angle: -120, length: 32 }, { angle: 0, length: 18 }], symbolArmWidth: 10, symbolCornerStyle: 'inherit' });
  Object.assign(source.nodes[1], { symbol: 'cross', crossStyleMode: 'custom', symbolSize: 2.3, symbolArmWidth: 20, symbolCornerStyle: 'sharp' });
  const once = validateMap(source);
  const twice = validateMap(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
  assert.equal(twice.defaults.style, 'triple');
  assert.equal(twice.defaults.width, 16);
  assert.equal(twice.lines[0].styleMode, 'global');
  assert.equal(twice.lines[1].styleMode, 'custom');
  assert.equal(twice.lines[1].style, 'double');
  assert.equal(twice.lines[1].cornerStyle, 'bevel');
  assert.equal(twice.nodes[0].symbolAngle, 25);
  assert.deepEqual(twice.nodes[0].symbolCrossArms, source.nodes[0].symbolCrossArms);
  assert.equal(twice.nodes[1].symbolSize, 2.3);
  assert.equal(twice.nodes[1].symbolArmWidth, 20);
  assert.deepEqual(twice.lines[0].nodeIds, ['a', 'b']);
});

test('legacy customized appearances remain local while newer unsafe styles are normalized', () => {
  const source = fixture();
  source.lines[0].style = 'dashed';
  source.lines[0].width = 12;
  source.nodes[0].symbol = 'cross';
  source.nodes[0].symbolSize = 1.5;
  const result = validateMap(source);
  assert.equal(result.lines[0].styleMode, 'custom');
  assert.equal(result.nodes[0].crossStyleMode, 'custom');
  source.defaults = { style: '<script>', width: Infinity, crossWidth: 500, crossSize: -1 };
  source.lines[0].cornerStyle = 'bad';
  source.lines[0].routing = 'bad';
  source.nodes[0].symbolArmWidth = -100;
  source.nodes[0].symbolCornerStyle = 'url(evil)';
  const safe = validateMap(source);
  assert.equal(safe.defaults.style, 'solid');
  assert.equal(safe.defaults.width, 6);
  assert.equal(safe.defaults.crossWidth, 24);
  assert.equal(safe.defaults.crossSize, .6);
  assert.equal(safe.lines[0].cornerStyle, 'rounded');
  assert.equal(safe.lines[0].routing, 'octilinear');
  assert.equal(safe.nodes[0].symbolArmWidth, 6);
  assert.equal(safe.nodes[0].symbolCornerStyle, 'inherit');
});
