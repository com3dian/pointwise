import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDefaults,effectiveNode} from '../dist/styles.js';
import {effectiveLabel,labelLayout} from '../dist/labels.js';
import {SYMBOL_TYPES,normalizeSymbol,normalizeSymbolColors,renderStationSymbol} from '../dist/symbols.js';
import {validateMap} from '../dist/model.js';
import {buildSVG} from '../dist/export.js';
const fixture=()=>({version:1,title:'Colors',theme:'paper',defaults:{labelColor:'#7a369b',crossOutline:'custom',crossFill:'custom',crossOutlineColor:'#1a4a8a',crossFillColor:'#f1b74d'},nodes:[{id:'cross',x:0,y:0,name:'Color stop',symbol:'cross',crossStyleMode:'global',labelStyleMode:'global',symbolCrossMode:'manual',symbolCrossArms:[{angle:0,length:30},{angle:45,length:25},{angle:180,length:20}],labelOffsetX:25,labelOffsetY:-15}],lines:[]});
test('global text color changes apply to inherited names while local colors and positions remain independent',()=>{
 const m=fixture(),n=m.nodes[0];assert.equal(effectiveLabel(m,n).labelColor,'#7a369b');
 const before=labelLayout(effectiveLabel(m,n));m.defaults.labelColor='#a34129';assert.equal(effectiveLabel(m,n).labelColor,'#a34129');
 assert.deepEqual(labelLayout(effectiveLabel(m,n)),before);
 assert.equal(effectiveLabel(m,{...n,labelStyleMode:'custom',labelColor:'#125b78'}).labelColor,'#125b78');
 assert.equal(effectiveLabel(m,{...n,labelStyleMode:'custom',labelColor:'auto'}).labelColor,'auto');
});
test('cross colors inherit globally without changing arm geometry, size, or rotation',()=>{
 const m=fixture(),n=m.nodes[0],resolved=effectiveNode(m,n);
 assert.equal(resolved.symbolOutline,'custom');assert.equal(resolved.symbolFill,'custom');assert.equal(resolved.symbolOutlineColor,'#1a4a8a');assert.equal(resolved.symbolFillColor,'#f1b74d');
 assert.deepEqual(resolved.symbolCrossArms,n.symbolCrossArms);
 const before=renderStationSymbol(resolved);
 m.defaults.crossOutlineColor='#654321';m.defaults.crossFillColor='#abcdef';
 const after=renderStationSymbol(effectiveNode(m,n));assert.match(after,/stroke="#654321"/);assert.match(after,/fill="#abcdef"/);
 assert.equal(before.match(/ d="([^"]+)"/)[1],after.match(/ d="([^"]+)"/)[1]);
});
test('local cross colors override later defaults and relinking restores shared colors',()=>{
 const m=fixture(),n={...m.nodes[0],crossStyleMode:'custom',symbolOutline:'custom',symbolFill:'custom',symbolOutlineColor:'#773322',symbolFillColor:'#ffeecc'};
 assert.equal(effectiveNode(m,n).symbolOutlineColor,'#773322');assert.equal(effectiveNode(m,n).symbolFillColor,'#ffeecc');
 assert.equal(effectiveNode(m,{...n,crossStyleMode:'global'}).symbolOutlineColor,'#1a4a8a');
});
test('color choices and inheritance survive JSON serialization',()=>{
 const m=fixture();m.nodes.push({...m.nodes[0],id:'local',crossStyleMode:'custom',symbolOutline:'custom',symbolFill:'custom',symbolOutlineColor:'#663399',symbolFillColor:'#fae1c4',labelStyleMode:'custom',labelColor:'#227766'});
 const validated=validateMap(m),loaded=validateMap(JSON.parse(JSON.stringify(validated)));
 assert.deepEqual(loaded,validated);assert.equal(loaded.nodes[1].labelColor,'#227766');assert.equal(loaded.nodes[1].symbolFillColor,'#fae1c4');assert.equal(loaded.defaults.crossOutlineColor,'#1a4a8a');
});
test('SVG includes effective text, cross-outline and cross-interior colors',()=>{
 const svg=buildSVG(validateMap(fixture()));assert.match(svg,/font-weight="500" fill="#7a369b"/);assert.match(svg,/stroke="#1a4a8a"/);assert.match(svg,/fill="#f1b74d"/);
});
test('unsafe color data falls back before HTML or SVG generation',()=>{
 const m=fixture();m.defaults.labelColor='url(javascript:evil)';m.defaults.crossOutlineColor='"><script>';m.nodes[0].labelStyleMode='custom';m.nodes[0].labelColor='red;stroke:url(evil)';
 assert.equal(normalizeDefaults(m.defaults).labelColor,'auto');assert.equal(normalizeSymbolColors({symbolFillColor:'<img>'}).fillColor,'#ffffff');assert.equal(normalizeSymbol({symbolOutline:'custom'}).outline,'custom');
 const svg=buildSVG(validateMap(m));assert.doesNotMatch(svg,/<script|<img|javascript:|url\(evil\)/);
});
test('automatic text and station ink adapt to light and dark backgrounds',()=>{
 const m=fixture();m.defaults.labelColor='auto';m.defaults.crossOutline='ink';m.defaults.crossFill='paper';
 const light=buildSVG(m);m.theme='night';const dark=buildSVG(m);
 assert.match(light,/font-weight="500" fill="#344038"/);assert.match(dark,/font-weight="500" fill="#e3eadc"/);
 assert.match(dark,/stroke="#e3eadc"/);assert.match(dark,/fill="#1e2925"/);
});

test('automatic stops accept custom outline colors, even the default stored ink color',()=>{
 for(const interchange of [false,true]){
  const svg=renderStationSymbol({symbol:'auto',symbolOutline:'custom',symbolOutlineColor:'#344038'},{colors:['#4068e8'],interchange});
  assert.match(svg,/stroke="#344038"/);
 }
 const routeInk=renderStationSymbol({symbol:'auto',symbolOutline:'line'},{colors:['#4068e8'],interchange:true});assert.match(routeInk,/stroke="#4068e8"/);
});
test('every station symbol, including segmented rings, displays its explicit outline color',()=>{
 for(const {id:symbol} of SYMBOL_TYPES){
  const svg=renderStationSymbol({symbol,symbolOutline:'custom',symbolOutlineColor:'#ab3478'},{colors:['#112233','#445566'],interchange:true});
  assert.match(svg,/stroke="#ab3478"/,symbol);
 }
});
