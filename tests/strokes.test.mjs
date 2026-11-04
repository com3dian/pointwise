import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLineStroke, lineStrokeExtent } from '../dist/strokes.js';

const route = 'M 0 0 L 50 0 Q 60 0 60 10 L 60 70';
const drawing = style => renderLineStroke(route, {style,width:10,color:'#e89a38',cornerRadius:20}, {paper:'#fff'});

test('all route patterns use visible distinct strokes and the supplied map background', () => {
  const results = ['solid','dashed','dotted','double','triple','outlined'].map(drawing);
  assert.equal(new Set(results).size,6);
  assert.match(drawing('dashed'),/stroke-dasharray="6 10"/);
  assert.match(drawing('dotted'),/stroke-dasharray="0 18"/);
  assert.equal((drawing('solid').match(/<path /g)||[]).length,1);
  assert.equal((drawing('double').match(/<path /g)||[]).length,2);
  assert.equal((drawing('triple').match(/<path /g)||[]).length,3);
  assert.equal((drawing('outlined').match(/<path /g)||[]).length,2);
  assert.match(drawing('double'),/stroke="#fff" stroke-width="3.5"/);
  assert.match(drawing('triple'),/stroke="#fff" stroke-width="6"/);
  assert.match(drawing('triple'),/stroke="#e89a38" stroke-width="2"/);
  assert.match(drawing('outlined'),/stroke="#fff" stroke-width="14"/);
});

test('stroke layers respect corner styles, zero radius, overrides, and physical extents', () => {
  assert.match(renderLineStroke(route,{cornerStyle:'sharp',cornerRadius:20}),/stroke-linejoin="miter"/);
  assert.match(renderLineStroke(route,{cornerStyle:'bevel',cornerRadius:20}),/stroke-linejoin="bevel"/);
  assert.match(renderLineStroke(route,{cornerStyle:'circular',cornerRadius:20}),/stroke-linejoin="round"/);
  assert.match(renderLineStroke(route,{cornerStyle:'rounded',cornerRadius:0}),/stroke-linejoin="miter"/);
  assert.match(renderLineStroke(route,{color:'#123456'},{color:'#888888'}),/stroke="#888888"/);
  assert.equal(lineStrokeExtent({style:'solid',width:24,cornerRadius:20}),12);
  assert.equal(lineStrokeExtent({style:'outlined',width:24,cornerRadius:20}),14);
  assert.equal(lineStrokeExtent({style:'outlined',width:24,cornerRadius:0}),26);
});

test('unsafe markup and invalid visual properties cannot escape into SVG', () => {
  const svg = renderLineStroke('M0 0"/><script>evil</script>', {style:'"/><script>',width:Infinity,color:'url(evil)'}, {paper:'javascript:evil',color:'" onclick="evil'});
  assert.doesNotMatch(svg,/<script>|onclick=|url\(|javascript:|NaN|Infinity/);
  assert.match(svg,/data-line-style="solid"/);
  assert.match(svg,/d=""/);
  assert.match(svg,/stroke-width="8"/);
});
