import test from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOL_TYPES, normalizeSymbol, normalizeCrossArms, resolveCrossArms, renderStationSymbol, symbolExtent } from '../dist/symbols.js';

test('legacy stations keep automatic circles and interchange membership styling', () => {
  assert.deepEqual(normalizeSymbol({}), { shape:'auto', angle:0, size:1, length:28, outline:'ink', fill:'paper' });
  const regular = renderStationSymbol({ x:20, y:40 }, { colors:['#123456'] });
  const interchange = renderStationSymbol({ x:20, y:40 }, { colors:['#123456'], interchange:true });
  assert.match(regular, /r="6".*stroke="#123456"/);
  assert.match(interchange, /r="9".*stroke="#344038"/);
  assert.equal(symbolExtent({}), 8);
  assert.equal(symbolExtent({}, true), 11);
  const normalized = {symbol:'auto',symbolOutline:'ink'};
  assert.match(renderStationSymbol(normalized,{colors:['#123456']}), /r="6".*stroke="#123456"/);
  assert.match(renderStationSymbol(normalized,{colors:['#123456'],interchange:true}), /r="9".*stroke="#344038"/);
});

test('all twelve station presets produce distinct, self-contained SVG glyphs', () => {
  assert.equal(SYMBOL_TYPES.length, 12);
  assert.equal(new Set(SYMBOL_TYPES.map(type => type.id)).size, SYMBOL_TYPES.length);
  const results = SYMBOL_TYPES.map(type => {
    const result = renderStationSymbol({ symbol:type.id, x:10, y:20 }, { colors:['#c99a58','#8c503c'] });
    assert.match(result, /class="station-symbol"/);
    assert.match(result, new RegExp(`data-symbol="${type.id}"`));
    assert.match(result, /pointer-events="none"/);
    assert.ok(!/NaN|Infinity|undefined/.test(result));
    assert.ok(symbolExtent({symbol:type.id}) > 0);
    return result.replace(/data-symbol="[^"]*"/, '');
  });
  assert.equal(new Set(results).size, results.length);
});

test('appearance is clamped, markup is sanitized, and invalid shapes recover safely', () => {
  const node = { symbol:'<script>', symbolAngle:Infinity, symbolSize:9, symbolLength:-10, symbolOutline:'evil', symbolFill:'<img>', x:NaN, y:Infinity };
  assert.deepEqual(normalizeSymbol(node), {shape:'auto',angle:0,size:3,length:12,outline:'ink',fill:'paper'});
  const result = renderStationSymbol(node, {colors:['"/><script>'],ink:'javascript:evil',paper:'url(evil)'});
  assert.ok(!result.includes('<script>'));
  assert.ok(!result.includes('javascript:') && !result.includes('url('));
  assert.match(result, /translate\(0 0\) rotate\(0\) scale\(3\)/);
  assert.equal(normalizeSymbol({symbolAngle:-300,symbolSize:-1,symbolLength:100}).angle,-180);
  assert.equal(normalizeSymbol({symbolSize:-1}).size,.6);
  assert.equal(normalizeSymbol({symbolLength:100}).length,60);
});

test('route dots preserve both colors while rotations and span remain editable', () => {
  const node = {x:25,y:-40,symbol:'linked-dots',symbolAngle:45,symbolSize:1.5,symbolLength:40,symbolOutline:'line'};
  const result = renderStationSymbol(node,{colors:['#c99a58','#8c503c']});
  assert.match(result,/translate\(25 -40\) rotate\(45\) scale\(1.5\)/);
  assert.match(result,/cx="-20"/);
  assert.match(result,/cx="20"/);
  assert.match(result,/fill="#c99a58"/);
  assert.match(result,/fill="#8c503c"/);
  assert.ok(symbolExtent(node) >= (20+9)*1.5);
  assert.equal(symbolExtent({...node,symbolAngle:135}),symbolExtent(node));
});

test('open capsules keep a transparent center and ring segments use each route', () => {
  const capsule = renderStationSymbol({symbol:'open-capsule'});
  assert.match(capsule,/fill="none" stroke="#f8f9f5" stroke-width="7"/);
  assert.match(capsule,/fill="none" stroke="#344038" stroke-width="2.5"/);
  const segmented = renderStationSymbol({symbol:'segmented-ring'},{colors:['#111111','#222222','#333333']});
  assert.equal((segmented.match(/<path /g)||[]).length,3);
  for(const c of ['#111111','#222222','#333333'])assert.ok(segmented.includes(`stroke="${c}"`));
});

test('symbol extents cover long, scaled glyphs and transparent fill remains optional', () => {
  for(const type of SYMBOL_TYPES) {
    const node={symbol:type.id,symbolSize:3,symbolLength:60};
    assert.ok(Number.isFinite(symbolExtent(node)));
    assert.ok(symbolExtent(node)>=symbolExtent({...node,symbolSize:1})*3-.001);
  }
  const cross=renderStationSymbol({symbol:'cross',symbolFill:'transparent',symbolOutline:'line'},{colors:['#abc']});
  assert.match(cross,/fill="none" stroke="#abc"/);
  const oneColor=renderStationSymbol({symbol:'pill-dots'},{colors:['#abcd12']});
  assert.equal((oneColor.match(/fill="#abcd12"/g)||[]).length,2);
});

const pathPoints = (svg) => [...svg.match(/<path d="([^"]+)"/)[1].matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)]
  .map(match => ({x:Number(match[1]),y:Number(match[2])}));

test('adaptive crosses follow diagonal routes with one closed outside border', () => {
  const directions=[{angle:0},{angle:45},{angle:180},{angle:225}];
  const svg=renderStationSymbol({symbol:'cross',symbolLength:40},{directions});
  assert.match(svg,/data-cross-arm-count="4"/);
  assert.match(svg,/data-cross-angles="0,45,-180,-135"/);
  assert.equal((svg.match(/<path /g)||[]).length,1,'the union must not contain internal stroked arm borders');
  assert.match(svg,/ Z" fill=/);
  const points=pathPoints(svg);
  for(const angle of [0,45,180,225]) {
    const rad=angle*Math.PI/180;
    const along=points.map(p=>p.x*Math.cos(rad)+p.y*Math.sin(rad));
    assert(Math.max(...along)>=23.99,'every route must receive a full-length arm');
  }
  const orthogonal=renderStationSymbol({symbol:'cross',symbolLength:40});
  assert.notEqual(svg.match(/<path d="([^"]+)/)[1],orthogonal.match(/<path d="([^"]+)/)[1]);
});

test('manual crosses keep independent arm angles and lengths rather than inferred topology', () => {
  const node={symbol:'cross',symbolCrossMode:'manual',symbolCrossArms:[{angle:0,length:35},{angle:110,length:12},{angle:-120,length:24}],symbolAngle:15,symbolSize:2};
  const svg=renderStationSymbol(node,{directions:[{angle:90,length:60}]});
  assert.match(svg,/data-cross-arm-count="3"/);
  assert.match(svg,/data-cross-angles="0,110,-120"/);
  assert.match(svg,/rotate\(15\) scale\(2\)/);
  assert.deepEqual(resolveCrossArms(node),node.symbolCrossArms);
  assert(Math.abs(symbolExtent(node)-symbolExtent({...node,symbolAngle:135}))<1e-9);
  assert(symbolExtent(node)>70&&symbolExtent(node)<75);
  const points=pathPoints(svg);
  for(const arm of node.symbolCrossArms) {
    const angle=arm.angle*Math.PI/180;
    const best=points.reduce((d,p)=>Math.min(d,Math.hypot(p.x-arm.length*Math.cos(angle),p.y-arm.length*Math.sin(angle))),Infinity);
    assert(best<5.01,'an arm end remains within its half-width of the requested endpoint');
  }
});

test('invalid arm settings recover safely and duplicate directions merge without losing reach', () => {
  assert.equal(normalizeCrossArms(null).length,4);
  assert.equal(normalizeCrossArms([{angle:Infinity}]).length,4);
  assert.deepEqual(normalizeCrossArms([{angle:999,length:1000},{angle:-999,length:-4},{angle:20}]),[
    {angle:180,length:60},{angle:-180,length:6},{angle:20,length:18},
  ]);
  assert.equal(normalizeCrossArms(Array.from({length:12},(_,i)=>({angle:i*10,length:18}))).length,8);
  assert.deepEqual(resolveCrossArms({symbolLength:60},[{angle:0,length:10},{angle:360,length:40},{angle:.001,length:20}]),[{angle:0,length:40}]);
  assert.deepEqual(resolveCrossArms({symbolCrossMode:'auto',symbolCrossArms:[{angle:75,length:60}]},[{angle:90}]),[{angle:90,length:18}]);
});

test('acute, nearly parallel, opposite and single-arm crosses remain finite and bounded', () => {
  const layouts=[
    [{angle:0,length:60},{angle:.02,length:50},{angle:180,length:20}],
    [{angle:45,length:6}],
    [{angle:0,length:18},{angle:180,length:18}],
    [{angle:0,length:60},{angle:1,length:6},{angle:160,length:30},{angle:-179,length:18}],
    Array.from({length:8},(_,i)=>({angle:i*45-180,length:6+i*7})),
  ];
  for(const arms of layouts) {
    const node={symbol:'cross',symbolCrossMode:'manual',symbolCrossArms:arms};
    const svg=renderStationSymbol(node);
    assert(!/NaN|Infinity|undefined/.test(svg));
    const extent=symbolExtent(node),points=pathPoints(svg);
    assert(points.length>=4);
    assert(points.every(p=>Math.hypot(p.x,p.y)<extent+1e-3));
  }
});

test('cross arm width and outline corner treatment follow resolved shared or custom styles', () => {
  const base={symbol:'cross',symbolCrossMode:'manual',symbolCrossArms:[{angle:0,length:18},{angle:90,length:18},{angle:180,length:18},{angle:-90,length:18}]};
  const thin=renderStationSymbol({...base,symbolArmWidth:6,symbolCornerStyle:'sharp'});
  const wide=renderStationSymbol({...base,symbolArmWidth:22,symbolCornerStyle:'bevel'});
  assert.match(thin,/stroke-linejoin="miter" stroke-miterlimit="2"/);
  assert.match(wide,/stroke-linejoin="bevel"/);
  assert.notEqual(thin.match(/<path d="([^"]*)/)[1],wide.match(/<path d="([^"]*)/)[1]);
  assert(symbolExtent({...base,symbolArmWidth:22})>symbolExtent({...base,symbolArmWidth:6}));
  for(const symbolCornerStyle of ['sharp','rounded','circular','bevel']) {
    const n={...base,symbolArmWidth:24,symbolCornerStyle};
    const svg=renderStationSymbol(n);
    assert(pathPoints(svg).every(point=>Math.hypot(point.x,point.y)<symbolExtent(n)));
    assert(!/NaN|undefined|Infinity/.test(svg));
  }
  assert.equal(renderStationSymbol({...base,symbolArmWidth:1000}),renderStationSymbol({...base,symbolArmWidth:24}));
});
