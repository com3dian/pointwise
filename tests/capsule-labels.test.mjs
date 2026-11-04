import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveLabel, normalizeTextStyle, labelLayout, labelCapsuleBounds } from '../dist/labels.js';
import { validateMap } from '../dist/model.js';
import { buildSVG } from '../dist/export.js';
import { applyBatchStyle } from '../dist/multiselect.js';

const fixture=()=>({version:1,title:'Capsule labels',theme:'paper',defaults:{labelShape:'capsule',labelFillColor:'#ffeecc',labelBorderColor:'#445566',labelPadding:12,labelBorderWidth:2},nodes:[{id:'a',kind:'station',name:'A name with WIDE letters',x:100,y:200,symbol:'circle',labelStyleMode:'global',labelOffsetX:20,labelOffsetY:-10},{id:'b',kind:'station',name:'Local plain name',x:300,y:200,labelStyleMode:'custom',labelShape:'plain'}],lines:[]});
test('capsule defaults inherit, local plain names stay plain, and old files stay plain',()=>{
  const map=fixture();
  assert.equal(effectiveLabel(map,map.nodes[0]).labelShape,'capsule');
  assert.equal(effectiveLabel(map,map.nodes[1]).labelShape,'plain');
  assert.equal(normalizeTextStyle().labelShape,'plain');
  const copy=validateMap(JSON.parse(JSON.stringify(map)));
  assert.equal(copy.defaults.labelPadding,12);
  assert.equal(effectiveLabel(copy,copy.nodes[0]).labelFillColor,'#ffeecc');
  assert.equal(effectiveLabel(copy,copy.nodes[1]).labelShape,'plain');
});
test('capsule rectangles respect text anchors, padding, type size and border clearance',()=>{
  const n=effectiveLabel(fixture(),fixture().nodes[0]),pos={x:100,y:200,anchor:'start'};
  const start=labelCapsuleBounds(n,pos),end=labelCapsuleBounds(n,{...pos,anchor:'end'}),middle=labelCapsuleBounds(n,{...pos,anchor:'middle'});
  assert.equal(start.x,88);assert.equal(start.width,end.width);
  assert.equal(end.x+end.width,112);assert.equal(middle.x+middle.width/2,100);
  assert.ok(start.y<200&&start.y+start.height>200);
  assert.ok(labelCapsuleBounds({...n,labelFontSize:48},pos).width>start.width);
  const plain=labelLayout({...n,labelShape:'plain',labelFromStop:true,labelAngle:-45});
  const capsule=labelLayout({...n,labelFromStop:true,labelAngle:-45});
  assert.ok(capsule.x>plain.x&&capsule.y<plain.y);
});
test('rotated capsules export with matching transforms, paints and safe bounds',()=>{
  const map=fixture();Object.assign(map.defaults,{labelAngle:-45,labelFromStop:true,labelAnchor:'start'});
  map.nodes[0].name='Very wide name '.repeat(16);
  const svg=buildSVG(map);
  assert.match(svg,/<rect class="label-capsule"[^>]+fill="#ffeecc" stroke="#445566" stroke-width="2" transform="rotate\(-45 /);
  const transforms=[...svg.matchAll(/transform="(rotate\(-45 [^"]+)"/g)].map(m=>m[1]);
  assert.equal(transforms.length,2);assert.equal(transforms[0],transforms[1]);
  assert.ok(Number(svg.match(/width="(\d+)" height="(\d+)"/)[2])>1000);
  assert.equal((svg.match(/class="label-capsule"/g)||[]).length,1);
  assert.doesNotMatch(svg,/NaN|Infinity/);
});
test('automatic capsule paints follow map background and resolved text ink',()=>{
  const map=fixture();Object.assign(map.defaults,{labelFillColor:'auto',labelBorderColor:'auto',labelColor:'#8899aa'});
  const light=buildSVG(map);assert.match(light,/<rect class="label-capsule"[^>]+fill="#f8f9f5" stroke="#8899aa"/);
  map.theme='night';map.defaults.labelColor='auto';
  assert.match(buildSVG(map),/<rect class="label-capsule"[^>]+fill="#1e2925" stroke="#e3eadc"/);
});
test('batch capsule edits preserve stop topology, offsets and other text properties',()=>{
  const map=fixture(),before=structuredClone(map),selection={type:'multi',items:map.nodes.map(n=>({type:'node',id:n.id}))};
  applyBatchStyle(map,selection,'node','labelShape','capsule');
  applyBatchStyle(map,selection,'node','labelFillColor','#aabbcc');
  for(let i=0;i<2;i++) {
    assert.equal(effectiveLabel(map,map.nodes[i]).labelShape,'capsule');
    assert.equal(effectiveLabel(map,map.nodes[i]).labelFillColor,'#aabbcc');
    assert.equal(map.nodes[i].x,before.nodes[i].x);assert.equal(map.nodes[i].name,before.nodes[i].name);
    assert.equal(map.nodes[i].labelOffsetX,before.nodes[i].labelOffsetX);
  }
});
test('invalid capsule shapes and paints are normalized before export',()=>{
  const bad=normalizeTextStyle({labelShape:'<script>',labelFillColor:'url(evil)',labelBorderColor:'"><script>',labelPadding:1000,labelBorderWidth:-1});
  assert.equal(bad.labelShape,'plain');assert.equal(bad.labelFillColor,'auto');assert.equal(bad.labelBorderColor,'auto');
  assert.equal(bad.labelPadding,40);assert.equal(bad.labelBorderWidth,0);
});
