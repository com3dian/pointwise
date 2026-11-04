import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleSelection, selectionItems, selectionKey, isSelected, selectedRecords, batchStyleValue, applyBatchStyle } from '../dist/multiselect.js';
import { effectiveLine, effectiveNode } from '../dist/styles.js';
import { effectiveLabel } from '../dist/labels.js';
import { validateMap } from '../dist/model.js';

const node=id=>({id,kind:'station',name:id,x:10,y:20,symbol:'circle',labelStyleMode:'global',labelOffsetX:7,labelOffsetY:-9});
const fixture=()=>({title:'Selection',defaults:{width:12,cornerRadius:44,crossSize:2,labelFontSize:32},nodes:[node('a'),{...node('b'),symbol:'cross',crossStyleMode:'global',symbolAngle:17,symbolCrossMode:'manual',symbolCrossArms:[{angle:45,length:25},{angle:180,length:19}]},node('c')],lines:[{id:'one',name:'One',color:'#123456',styleMode:'global',nodeIds:['a','b'],visible:true},{id:'two',name:'Two',color:'#abcdef',styleMode:'custom',width:8,cornerRadius:10,nodeIds:['b','c'],visible:true},{id:'three',name:'Three',color:'#aabbcc',styleMode:'global',nodeIds:['a','c'],visible:true}]});
const bothNodes={type:'multi',items:[{type:'node',id:'a'},{type:'node',id:'b'}]};
const bothLines={type:'multi',items:[{type:'line',id:'one'},{type:'line',id:'two'}]};

test('Shift selection toggles typed identities and collapses back to a single selection',()=>{
  let selection=toggleSelection(null,{type:'node',id:'same'});
  selection=toggleSelection(selection,{type:'line',id:'same'});
  assert.equal(selectionItems(selection).length,2);
  assert.equal(isSelected(selection,'node','same'),true);
  assert.equal(selectionKey(selection),selectionKey({type:'multi',items:[...selection.items].reverse()}));
  selection=toggleSelection(selection,{type:'node',id:'same'});
  assert.deepEqual(selection,{type:'line',id:'same'});
  assert.equal(toggleSelection(selection,{type:'line',id:'same'}),null);
});
test('mixed values resolve inherited styles rather than stale stored properties',()=>{
  const map=fixture();
  assert.deepEqual(batchStyleValue(map,bothLines,'line','width'),{value:12,mixed:true});
  assert.deepEqual(batchStyleValue(map,bothNodes,'node','labelFontSize'),{value:32,mixed:false});
  assert.equal(batchStyleValue(map,{type:'node',id:'b'},'node','symbolSize').value,2);
  assert.equal(selectedRecords(map,bothLines,'node').length,0);
});
test('batch line edits retain each unrelated style, color and topology',()=>{
  const map=fixture(),before=structuredClone(map);
  assert.equal(applyBatchStyle(map,bothLines,'line','style','dashed'),true);
  assert.equal(effectiveLine(map,map.lines[0]).width,12);
  assert.equal(effectiveLine(map,map.lines[0]).cornerRadius,44);
  assert.equal(effectiveLine(map,map.lines[1]).width,8);
  for(let i=0;i<2;i++) {
    assert.equal(effectiveLine(map,map.lines[i]).style,'dashed');
    assert.equal(map.lines[i].color,before.lines[i].color);
    assert.deepEqual(map.lines[i].nodeIds,before.lines[i].nodeIds);
  }
  assert.deepEqual(map.lines[2],before.lines[2]);assert.deepEqual(map.nodes,before.nodes);
  assert.equal(applyBatchStyle(map,bothLines,'line','style','dashed'),false);
});
test('batch colors preserve global route inheritance and reject content fields',()=>{
  const map=fixture();
  applyBatchStyle(map,bothLines,'line','color','#998877');
  assert.equal(map.lines[0].styleMode,'global');
  assert.equal(map.lines[1].styleMode,'custom');
  assert.equal(applyBatchStyle(map,bothLines,'line','name','Renamed'),false);
  assert.equal(applyBatchStyle(map,bothNodes,'node','x',200),false);
  assert.equal(map.nodes[0].x,10);
});
test('batch stop text freezes inherited typography but preserves names and offsets',()=>{
  const map=fixture(),before=structuredClone(map);
  applyBatchStyle(map,bothNodes,'node','labelColor','#998877');
  for(let i=0;i<2;i++) {
    assert.equal(effectiveLabel(map,map.nodes[i]).labelColor,'#998877');
    assert.equal(effectiveLabel(map,map.nodes[i]).labelFontSize,32);
    assert.equal(map.nodes[i].name,before.nodes[i].name);
    assert.equal(map.nodes[i].labelOffsetX,7);assert.equal(map.nodes[i].labelOffsetY,-9);
  }
  assert.deepEqual(map.nodes[2],before.nodes[2]);
  applyBatchStyle(map,bothNodes,'node','labelStyleMode','global');
  assert.equal(effectiveLabel(map,map.nodes[0]).labelColor,'auto');
});
test('batch cross paints preserve fitted arms, rotation and inherited dimensions',()=>{
  const map=fixture(),before=structuredClone(map.nodes[1]);
  applyBatchStyle(map,bothNodes,'node','symbolOutlineColor','#344038');
  assert.equal(map.nodes[0].symbolOutline,'custom');
  assert.equal(map.nodes[1].symbolOutline,'custom');
  assert.equal(effectiveNode(map,map.nodes[1]).symbolSize,2);
  assert.equal(map.nodes[1].symbolAngle,17);
  assert.deepEqual(map.nodes[1].symbolCrossArms,before.symbolCrossArms);
});
test('mixed stop and line selection edits only its explicit targets and survives JSON',()=>{
  const map=fixture(),selection={type:'multi',items:[{type:'node',id:'a'},{type:'line',id:'two'}]},before=structuredClone(map);
  applyBatchStyle(map,selection,'node','symbol','capsule');
  applyBatchStyle(map,selection,'line','cornerRadius',64);
  assert.deepEqual(map.nodes[1],before.nodes[1]);assert.deepEqual(map.nodes[2],before.nodes[2]);
  assert.deepEqual(map.lines[0],before.lines[0]);
  const restored=validateMap(JSON.parse(JSON.stringify({...map,version:1})));
  assert.equal(restored.nodes[0].symbol,'capsule');
  assert.equal(effectiveLine(restored,restored.lines[1]).cornerRadius,64);
});
