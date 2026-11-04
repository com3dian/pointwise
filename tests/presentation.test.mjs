import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDescription, descriptionLink } from '../dist/markdown.js';
import { stationStoryPosition } from '../dist/presentation.js';

test('station descriptions render headings, nested lists, emphasis, quotes and code',()=>{
  const html=renderDescription('# Heading\n\nA **bold** and *italic* idea with `code`.\n\n- First\n  - Nested\n- Second\n\n> A quote\n\n```js\nconst x = "<unsafe>";\n```');
  for(const pattern of [/<h1>Heading<\/h1>/,/<strong>bold<\/strong>/,/<em>italic<\/em>/,/<code>code<\/code>/,/<ul>/,/<blockquote>/,/&lt;unsafe&gt;/])assert.match(html,pattern);
  assert.equal((html.match(/<ul>/g)||[]).length,2);
});
test('tables, ordered lists, task lists and line breaks work in descriptions',()=>{
  const html=renderDescription('| Step | State |\n| --- | --- |\n| Plan | Ready |\n\n1. First\n2. Next\n\n- [x] Done\n\nOne line\nNext line');
  for(const pattern of [/<table>/,/<th>Step<\/th>/,/<ol>/,/type="checkbox"/,/disabled/,/One line<br>/])assert.match(html,pattern);
});
test('raw HTML and script/event markup in imported Markdown are displayed as text',()=>{
  for(const source of ['<script>alert(1)</script>','<img src=x onerror="alert(1)">','<svg onload=alert(1)>','Hello <iframe src="evil"></iframe>']) {
    const html=renderDescription(source);assert.doesNotMatch(html,/<script|<img|<svg|<iframe|<object/i);assert.match(html,/&lt;/);
  }
});
test('links preserve formatted labels and escape attributes while blocking unsafe schemes',()=>{
  const safe=renderDescription('[**Read more**](https://example.com "A title")');
  assert.match(safe,/<a href="https:\/\/example.com\/" title="A title" target="_blank" rel="noopener noreferrer"><strong>Read more<\/strong><\/a>/);
  for(const url of ['javascript:alert','JaVaScRiPt:alert','data:text/html,evil','vbscript:evil','file:///private/file','javascript&#58;evil']) {
    assert.equal(descriptionLink(url),null);
    assert.doesNotMatch(renderDescription(`[unsafe](${url})`),/<a\b/);
  }
  assert.match(renderDescription('[email](mailto:hello@example.com)'),/href="mailto:hello@example.com"/);
});
test('Markdown images are safe explicit links and never load remote media automatically',()=>{
  const html=renderDescription('![Diagram](https://example.com/image.png)');
  assert.doesNotMatch(html,/<img\b/);assert.match(html,/>Diagram<\/a>/);
  assert.doesNotMatch(renderDescription('![bad](javascript:alert)'),/href=/);
});
test('unusual and empty Markdown stays safe and descriptions remain bounded',()=>{
  assert.equal(renderDescription(''),'');assert.doesNotMatch(renderDescription('\\[ * '.repeat(3000)),/undefined|NaN/);
  assert.ok(renderDescription('a'.repeat(20000)).length<10100);
  assert.match(renderDescription('```\n<img onerror=evil>\n```'),/&lt;img onerror=evil&gt;/);
});
test('description cards prefer above the stop, then flip below near the top',()=>{
  const viewport={width:1200,height:800},card={width:360,height:220};
  const above=stationStoryPosition({x:600,y:500,radius:10},card,viewport);
  assert.equal(above.placement,'above');assert.equal(above.top,256);assert.equal(above.left,420);assert.equal(above.arrow,180);
  const below=stationStoryPosition({x:600,y:60,radius:10},card,viewport);
  assert.equal(below.placement,'below');assert.equal(below.top,84);
});
test('description cards and arrows stay within viewport bounds near each edge',()=>{
  const viewport={width:400,height:500},card={width:360,height:320};
  for(const x of [0,10,200,390,400])for(const y of [0,50,250,450,500]) {
    const p=stationStoryPosition({x,y,radius:10},card,viewport);
    assert.ok(p.left>=12&&p.left+card.width<=viewport.width-12);
    assert.ok(p.top>=12&&p.top+card.height<=viewport.height-12);
    assert.ok(p.arrow>=20&&p.arrow<=card.width-20);
  }
});
