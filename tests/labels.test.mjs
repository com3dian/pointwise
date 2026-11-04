import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveLabel,labelLayout,labelUsesDefaults,normalizeTextStyle,moveLabelOffset} from '../dist/labels.js';
import {validateMap} from '../dist/model.js';
import {buildSVG} from '../dist/export.js';
const stop={id:'a',x:100,y:200,name:'Station name',kind:'station',labelPosition:'right',symbol:'circle'};
const map=()=>({version:1,title:'Text',defaults:{labelFontSize:32,labelWeight:700,labelFontFamily:'serif',labelAngle:-45,labelAnchor:'start',labelFromStop:true,labelGap:10},nodes:[{...stop,labelOffsetX:15,labelOffsetY:-8}],lines:[]});

test('global text updates inherit without overwriting local placement or explicit styles',()=>{
 const m=map(),n=m.nodes[0];
 assert.equal(effectiveLabel(m,n).labelFontSize,32);
 m.defaults.labelFontSize=40;
 assert.equal(effectiveLabel(m,n).labelFontSize,40);
 assert.equal(effectiveLabel(m,n).labelOffsetX,15);
 const local={...n,labelStyleMode:'custom',labelFontSize:18,labelAngle:45};
 assert.equal(effectiveLabel(m,local).labelFontSize,18);
 assert.equal(effectiveLabel(m,local).labelAngle,45);
 assert.equal(effectiveLabel(m,{...local,labelStyleMode:'global'}).labelAngle,-45);
});
test('diagonal names start beyond the stop along their text direction',()=>{
 const m=map(),n=effectiveLabel(m,{...stop,labelOffsetX:0,labelOffsetY:0});
 const p=labelLayout(n),baseline=p.y-n.labelFontSize/4;
 assert.equal(p.anchor,'start');
 assert.ok(p.x>stop.x&&baseline<stop.y);
 assert.ok(Math.abs((p.x-stop.x)+(baseline-stop.y))<1e-8);
});
test('dragging a name leaves station and routes fixed and follows station movement afterward',()=>{
 const n={...stop};moveLabelOffset(n,{x:0,y:0},{x:35,y:-20});
 assert.deepEqual({x:n.x,y:n.y},{x:100,y:200});
 const before=labelLayout(effectiveLabel({},n));
 n.x+=60;n.y-=40;
 const after=labelLayout(effectiveLabel({},n));
 assert.equal(after.x-before.x,60);assert.equal(after.y-before.y,-40);
 moveLabelOffset(n,{x:35,y:-20},{x:10,y:5});
 assert.equal(n.labelOffsetX,45);assert.equal(n.labelOffsetY,-15);
});
test('font styles, angles, inheritance and offsets survive JSON roundtrip, including legacy angles',()=>{
 const m=validateMap(map());
 m.nodes.push({...m.nodes[0],id:'b',labelStyleMode:'custom',labelFontSize:21,labelAngle:45,labelAnchor:'end',labelOffsetX:-33});
 const loaded=validateMap(JSON.parse(JSON.stringify(m)));
 assert.deepEqual(loaded,m);
 assert.equal(effectiveLabel(loaded,loaded.nodes[0]).labelWeight,700);
 assert.equal(effectiveLabel(loaded,loaded.nodes[1]).labelFontSize,21);
 assert.equal(labelUsesDefaults({labelAngle:-45}),false);
 assert.equal(labelUsesDefaults({labelAngle:0}),true);
});
test('invalid text values are bounded and cannot introduce markup',()=>{
 const s=normalizeTextStyle({labelFontSize:1000,labelAngle:Infinity,labelFontFamily:'<script>',labelWeight:999,labelGap:-2,labelAnchor:'url(evil)'});
 assert.equal(s.labelFontSize,96);assert.equal(s.labelAngle,0);assert.equal(s.labelFontFamily,'sans');assert.equal(s.labelWeight,500);assert.equal(s.labelGap,0);assert.equal(s.labelAnchor,'auto');
 const m=map();m.nodes[0].labelOffsetX=Infinity;
 assert.equal(validateMap(m).nodes[0].labelOffsetX,0);
});
test('SVG exports resolved local/global fonts, arbitrary rotation, anchored positions and expanded bounds',()=>{
 const m=map();m.nodes[0].name='A very long station name '.repeat(4);m.nodes[0].labelOffsetX=1400;
 const original=buildSVG(m);assert.match(original,/font-family="Georgia, serif" font-size="32" font-weight="700"/);assert.match(original,/rotate\(-45 /);assert.match(original,/text-anchor="start"/);
 m.nodes[0].labelStyleMode='custom';Object.assign(m.nodes[0],{labelFontFamily:'mono',labelFontSize:60,labelAngle:135,labelWeight:600});
 const local=buildSVG(m);assert.match(local,/Courier New, monospace/);assert.match(local,/rotate\(135 /);
 const [,,height]=local.match(/width="(\d+)" height="(\d+)"/);assert.ok(Number(height)>1000);
 assert.doesNotMatch(local,/NaN|Infinity/);
});
