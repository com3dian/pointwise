import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSVG } from '../dist/export.js';
import { SYMBOL_TYPES, symbolExtent } from '../dist/symbols.js';

const node = (id, x, y, extra = {}) => ({ id, x, y, name: id, kind: 'station', labelPosition: 'top', ...extra });
const line = (id, nodeIds, extra = {}) => ({ id, nodeIds, color: '#4068E8', code: id, name: id, width: 8, visible: true, ...extra });
const map = (nodes, lines, extra = {}) => ({ title: 'A journey', subtitle: 'A little context', theme: 'paper', nodes, lines, ...extra });
const dimensions = (svg) => svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);

test('standalone SVG contains rounded routes, dashed styles, and escaped XML', () => {
  const svg = buildSVG(map([node('a', 0, 0), node('b', 100, 40, { name: '<name> & "value"' })], [line('route', ['a', 'b'], { style: 'dashed' })], { title: 'Title < & >', subtitle: 'A "quoted" note' }));
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, / Q /);
  assert.match(svg, /stroke-dasharray="6 10"/);
  assert.match(svg, /&lt;name&gt; &amp; &quot;value&quot;/);
  assert.match(svg, /<title>Title &lt; &amp; &gt;<\/title>/);
  assert(!svg.includes('<name>'));
});

test('long labels expand export bounds, including the height of rotated labels', () => {
  const plain = buildSVG(map([node('a', 0, 0, { name: 'W'.repeat(100), labelPosition: 'right' })], []));
  const angled = buildSVG(map([node('a', 0, 0, { name: 'W'.repeat(100), labelPosition: 'right', labelAngle: -45 })], []));
  const [plainWidth, plainHeight] = dimensions(plain);
  const [angledWidth, angledHeight] = dimensions(angled);
  assert(plainWidth > 1700, 'long horizontal label must not be cropped by fixed node padding');
  assert(angledHeight > plainHeight + 500, 'rotated label extents must affect vertical bounds');
  assert(angledWidth > 1200);
  const offset = Math.max(25.5, symbolExtent(node('a', 0, 0)) + 15);
  assert(angled.includes(`transform="rotate(-45 ${offset} 6)"`));
});

test('150 line legends wrap into rows fully inside the exported drawing', () => {
  const lines = Array.from({ length: 150 }, (_, index) => line(`L${index}`, ['a', 'b'], { name: `Route ${index}` }));
  const svg = buildSVG(map([node('a', 0, 0), node('b', 100, 0)], lines));
  const [width, height] = dimensions(svg);
  const positions = [...svg.matchAll(/class="legend-item" transform="translate\(([\d.]+) ([\d.]+)\)"/g)].map((match) => match.slice(1).map(Number));
  assert.equal(positions.length, 150);
  assert(new Set(positions.map(([, y]) => y)).size > 20, 'compact map legends must wrap');
  assert(positions.every(([x, y]) => x >= 48 && x < width - 48 && y > 0 && y + 14 < height));
  assert.match(svg, /L149 Route 149/);
});

test('a long legend name expands the frame instead of overflowing its row', () => {
  const svg = buildSVG(map([], [line('X', [], { name: 'W'.repeat(100) })]));
  assert(dimensions(svg)[0] > 1600);
  assert.match(svg, /X WWWWW/);
});

test('hidden-only stations are omitted and hidden connections do not create interchanges', () => {
  const svg = buildSVG(map([node('shared', 0, 0), node('visible', 80, 0), node('hidden', 0, 100)], [line('show', ['shared', 'visible']), line('hide', ['shared', 'hidden'], { visible: false, color: '#FF0000' })]));
  assert(!svg.includes('data-station-id="hidden"'));
  assert(!svg.includes('#FF0000'));
  assert.match(svg, /data-station-id="shared"><g class="station-symbol"[^>]*data-symbol="auto"[^>]*>[\s\S]*?<circle[^>]+r="6"/);
  assert.equal((svg.match(/class="legend-item"/g) || []).length, 1);
});

test('night, monochrome and empty maps produce complete valid frames', () => {
  const night = buildSVG(map([], [], { theme: 'night' }));
  assert.match(night, /fill="#1e2925"/);
  assert(dimensions(night).every((dimension) => dimension > 0));
  const mono = buildSVG(map([node('a', 0, 0), node('b', 100, 0)], [line('blue', ['a', 'b'])], { theme: 'mono' }));
  assert(!mono.includes('#4068E8'));
  assert.match(mono, /stroke="#344038"/);
});

const routePath = (svg) => svg.match(/class="map-content"[^>]*><g class="route-strokes"[^>]*><path[^>]* d="([^"]*)"/)[1];

test('line corner radius exports sharp, rounded, and bounded geometry independently', () => {
  const nodes = [node('a', 0, 0), node('b', 1000, 400)];
  const drawing = (radius) => buildSVG(map(nodes, [line('route', ['a', 'b'], { cornerRadius: radius })]));
  assert.doesNotMatch(routePath(drawing(0)), /\bQ\b/);
  assert.match(drawing(0), /stroke-linejoin="miter"/);
  assert.match(routePath(drawing(35)), /\bQ\b/);
  assert.notEqual(routePath(drawing(35)), routePath(drawing(80)));
  assert.equal(routePath(drawing(-25)), routePath(drawing(0)));
  assert.equal(routePath(drawing(10000)), routePath(drawing(160)));
  assert.equal(routePath(drawing(undefined)), routePath(drawing(20)));
});

test('every station preset exports its shared glyph and preserves size and orientation', () => {
  for (const { id: symbol } of SYMBOL_TYPES) {
    const station = node('example', 15, 25, { symbol, symbolAngle: 45, symbolSize: 2, symbolLength: 44 });
    const svg = buildSVG(map([station], []));
    assert(svg.includes(`data-symbol="${symbol}"`), `${symbol} must use its own symbol renderer`);
    assert.match(svg, /translate\(15 25\) rotate\(45\) scale\(2\)/);
    assert(!svg.includes('NaN'));
  }
});

test('large station symbols expand bounds and leave labels outside the glyph', () => {
  const a = node('a', 0, 0, { symbol: 'capsule', symbolSize: 3, symbolLength: 60, labelPosition: 'left' });
  const b = node('b', 3000, 0, { ...a, id: 'b', x: 3000, labelPosition: 'right' });
  const svg = buildSVG(map([a, b], [line('route', ['a', 'b'])]));
  const extent = symbolExtent(a);
  assert(dimensions(svg)[0] >= 3000 + 2 * extent + 96, 'both end glyphs must remain inside the frame');
  const leftX = Number(svg.match(/<text x="([\d.-]+)" y="6" text-anchor="end"/)[1]);
  const rightX = Number(svg.match(/<text x="([\d.-]+)" y="6" text-anchor="start"/)[1]);
  assert(Math.abs(leftX + extent + 15) < 0.001);
  assert(Math.abs(rightX - 3000 - extent - 15) < 0.001);
});

test('legend samples match their route colors in light, dark, and monochrome themes', () => {
  const sample = map([node('a', 0, 0), node('b', 100, 0)], [line('blue', ['a', 'b']), line('orange', ['a', 'b'], { color:'#E89A38', style:'dashed' })]);
  for (const theme of ['paper','night','mono']) {
    const svg = buildSVG({...sample,theme});
    const legendStrokes = [...svg.matchAll(/class="legend-item"[^>]*><g[^>]*><path[^>]*stroke="(#[a-f0-9]{6})"/gi)].map(match => match[1]);
    assert.deepEqual(legendStrokes,theme==='mono'?['#344038','#344038']:['#4068E8','#E89A38']);
    assert.match(svg.split('class="legend-item"')[2],/stroke-dasharray="6 10"/);
    if (theme !== 'mono') {
      const content = svg.split('class="map-content"')[1].split('class="legend-item"')[0];
      assert.match(content,/stroke="#4068E8"/);
      assert.match(content,/stroke="#E89A38"/);
    }
  }
});

test('automatic crosses follow actual nonorthogonal routes in exported SVG', () => {
  const nodes = [node('w', -100, 0),node('e',100,0),node('nw',-100,-100),node('se',100,100),node('hub',0,0,{symbol:'cross'})];
  const svg = buildSVG(map(nodes,[line('horizontal',['w','hub','e']),line('diagonal',['nw','hub','se'])]));
  const glyph = svg.match(/data-station-id="hub"><g class="station-symbol"[^>]*>/)[0];
  const angles = glyph.match(/data-cross-angles="([^"]*)"/)[1].split(/[ ,]+/).map(Number).sort((a,b)=>a-b);
  assert.deepEqual(angles,[-180,-135,0,45]);
  assert.match(glyph,/data-cross-arm-count="4"/);
});

test('custom cross arms preserve manual geometry and expand themed export bounds', () => {
  const cross = node('hub',0,0,{symbol:'cross',symbolCrossMode:'manual',symbolCrossArms:[{angle:-15,length:60},{angle:47,length:12},{angle:175,length:50}],symbolSize:3,labelPosition:'right'});
  const small = buildSVG(map([{...cross,symbolSize:1}],[]));
  for(const theme of ['paper','night','mono']) {
    const svg = buildSVG(map([cross],[],{theme}));
    const extent = symbolExtent(cross);
    assert(dimensions(svg)[1] > dimensions(small)[1]);
    assert(dimensions(svg)[1] >= 2 * extent + 120 + 48);
    assert.match(svg,/data-cross-arm-count="3"/);
    assert.match(svg,/data-cross-angles="-15,47,175"/);
    const textX = Number(svg.match(/<text x="([\d.-]+)" y="6" text-anchor="start"/)[1]);
    assert(Math.abs(textX - extent - 15) < .001);
    assert(!svg.includes('NaN'));
  }
});

test('map-wide line styles export with independent local overrides', () => {
  const nodes = [node('a',0,0),node('b',100,50),node('c',300,0),node('d',400,50)];
  const svg = buildSVG(map(nodes,[
    line('inherited',['a','b'],{styleMode:'global'}),
    line('custom',['c','d'],{styleMode:'custom',style:'triple',width:12,cornerStyle:'bevel',cornerRadius:25,routing:'octilinear'}),
  ],{defaults:{style:'double',width:16,cornerStyle:'circular',cornerRadius:20,routing:'orthogonal'}}));
  const drawing = svg.split('class="map-content"')[1].split('class="legend-item"')[0];
  assert.match(drawing,/data-line-style="double"/);
  assert.match(drawing,/data-line-style="triple"/);
  assert.match(drawing,/stroke-width="16"/);
  assert.match(drawing,/stroke-width="12"/);
  assert.match(routePath(svg),/\bA\b/,'inherited circular corners must use real arcs');
  assert.match(routePath(svg),/L 80 0/,'orthogonal geometry reaches its horizontal tangent before turning');
  assert.match(svg,/stroke-linejoin="bevel"/,'the selected route retains its separate corner style');
});

test('global cross size, width, and corners export without replacing local arm geometry', () => {
  const arms = [{angle:0,length:20},{angle:140,length:30},{angle:-100,length:18}];
  const global = node('global',0,0,{symbol:'cross',crossStyleMode:'global',symbolCrossMode:'manual',symbolCrossArms:arms,symbolAngle:37});
  const custom = node('custom',200,0,{symbol:'cross',crossStyleMode:'custom',symbolSize:1.2,symbolArmWidth:6,symbolCornerStyle:'bevel',symbolCrossMode:'manual',symbolCrossArms:arms});
  const svg = buildSVG(map([global,custom],[],{defaults:{cornerStyle:'sharp',crossSize:2,crossWidth:22}}));
  const globalGlyph = svg.split('data-station-id="global"')[1].split('</g><text')[0];
  const customGlyph = svg.split('data-station-id="custom"')[1].split('</g><text')[0];
  assert.match(globalGlyph,/rotate\(37\) scale\(2\)/);
  assert.match(globalGlyph,/data-cross-angles="0,140,-100"/);
  assert.match(globalGlyph,/stroke-linejoin="miter"/);
  assert.match(customGlyph,/scale\(1.2\)/);
  assert.match(customGlyph,/stroke-linejoin="bevel"/);
});
