import test from 'node:test';
import assert from 'node:assert/strict';
import {routeEditHandles,beginRoutePointEdit,moveRoutePoint} from '../dist/movement.js';
import {validateMap} from '../dist/model.js';
import {buildSVG} from '../dist/export.js';

const fixture=()=>({version:1,title:'Shape editing',theme:'paper',nodes:[{id:'a',x:0,y:0,name:'A'},{id:'hub',x:100,y:0,name:'Hub'},{id:'b',x:200,y:100,name:'B'},{id:'other',x:100,y:200,name:'Other'}],lines:[{id:'route',name:'Route',code:'01',color:'#4068E8',nodeIds:['a','hub','b']},{id:'connection',name:'Connection',code:'02',color:'#E89A38',nodeIds:['hub','other']}]});
const creator=()=>{let count=0;return()=>`bend-${++count}`;};

test('dragging an interstation point changes only its new bend and keeps station topology fixed',()=>{
  const map=fixture(),before=structuredClone(map),edit=beginRoutePointEdit(map,'route',{x:40,y:4},{createId:creator()});
  assert.deepEqual(edit.start,{x:40,y:0});assert.equal(edit.created,true);
  assert.equal(moveRoutePoint(map,edit,{x:10,y:60}),true);
  assert.deepEqual(map.nodes.slice(0,4),before.nodes);
  assert.deepEqual(map.lines[1],before.lines[1]);
  assert.deepEqual(map.lines[0].nodeIds,['a','bend-1','hub','b']);
  assert.deepEqual(map.nodes.at(-1),{...map.nodes.at(-1),x:50,y:60,kind:'bend'});
});

test('a continued drag reuses one bend and snaps from its original point without cumulative drift',()=>{
  const map=fixture(),edit=beginRoutePointEdit(map,'route',{x:43,y:0},{createId:creator()});
  moveRoutePoint(map,edit,{x:10,y:31},20);assert.deepEqual([map.nodes.at(-1).x,map.nodes.at(-1).y],[60,40]);
  moveRoutePoint(map,edit,{x:35,y:12},20);assert.deepEqual([map.nodes.at(-1).x,map.nodes.at(-1).y],[80,20]);
  assert.equal(map.nodes.length,5);assert.equal(map.lines[0].nodeIds.length,4);
});

test('route handles expose actual grid elbows and avoid station anchors',()=>{
  const map=fixture();map.nodes[2]={...map.nodes[2],x:200,y:60};
  const before=structuredClone(map),oct=routeEditHandles(map,'route'),ortho=routeEditHandles(map,'route','orthogonal');
  assert(oct.some(h=>h.kind==='corner'&&h.x===160&&h.y===60&&h.insertIndex===2));
  assert(ortho.some(h=>h.kind==='corner'&&h.x===200&&h.y===0&&h.insertIndex===2));
  assert(oct.some(h=>h.kind==='segment'&&h.x===50&&h.y===0&&h.insertIndex===1));
  assert(!oct.some(h=>map.nodes.some(n=>n.x===h.x&&n.y===h.y)));
  assert.deepEqual(map,before);
});

test('an explicit virtual handle index preserves which crossing segment is edited',()=>{
  const map=fixture(),edit=beginRoutePointEdit(map,'route',{x:50,y:25},{insertIndex:2,createId:creator()});
  assert.deepEqual(edit.start,{x:50,y:25});
  assert.deepEqual(map.lines[0].nodeIds,['a','hub','bend-1','b']);
});

test('editing an existing route bend reuses it while a bend shared with another route is cloned',()=>{
  const map=fixture(),createId=creator();
  const first=beginRoutePointEdit(map,'route',{x:40,y:0},{createId});
  const reused=beginRoutePointEdit(map,'route',{x:40,y:0},{nodeId:first.nodeId,createId});
  assert.equal(reused.created,false);assert.equal(reused.nodeId,first.nodeId);
  map.lines[1].nodeIds=['hub',first.nodeId,'other'];
  const sharedBefore=structuredClone(map.nodes.find(n=>n.id===first.nodeId));
  const cloned=beginRoutePointEdit(map,'route',{x:40,y:0},{nodeId:first.nodeId,createId});
  moveRoutePoint(map,cloned,{x:0,y:50});
  assert.equal(cloned.created,true);assert.notEqual(cloned.nodeId,first.nodeId);
  assert.deepEqual(map.nodes.find(n=>n.id===first.nodeId),sharedBefore);
  assert(map.lines[1].nodeIds.includes(first.nodeId));assert(!map.lines[1].nodeIds.includes(cloned.nodeId));
});

test('nearby explicit bends can be reused, but stations are never repurposed as route controls',()=>{
  const map=fixture(),createId=creator();
  const first=beginRoutePointEdit(map,'route',{x:40,y:0},{createId});
  const near=beginRoutePointEdit(map,'route',{x:43,y:2},{tolerance:5,createId});
  assert.equal(near.nodeId,first.nodeId);assert.equal(near.created,false);
  const before=structuredClone(map);
  assert.equal(beginRoutePointEdit(map,'route',{x:0,y:0},{nodeId:'a',createId}),null);
  assert.deepEqual(map,before);
});

test('local topology survives JSON validation and vector export without emitting a station for the bend',()=>{
  const map=fixture(),edit=beginRoutePointEdit(map,'route',{x:40,y:0},{createId:creator()});
  moveRoutePoint(map,edit,{x:0,y:-60});
  const restored=validateMap(JSON.parse(JSON.stringify(map))),svg=buildSVG(restored);
  assert(restored.lines[0].nodeIds.includes(edit.nodeId));
  assert.deepEqual(restored.nodes.find(n=>n.id===edit.nodeId).kind,'bend');
  assert(svg.includes('40 -60'));assert(!svg.includes(`data-station-id="${edit.nodeId}"`));
  assert.deepEqual(restored.nodes.filter(n=>n.kind!=='bend').map(n=>[n.id,n.x,n.y]),[['a',0,0],['hub',100,0],['b',200,100],['other',100,200]]);
});

test('short, coincident and invalid route data stays finite and cannot mutate stations',()=>{
  const map=fixture(),createId=creator();map.nodes[1].x=0;map.nodes[1].y=0;
  const handles=routeEditHandles(map,'route');
  assert(handles.every(h=>Number.isFinite(h.x)&&Number.isFinite(h.y)));
  const edit=beginRoutePointEdit(map,'route',{x:0,y:0},{createId});
  assert.equal(map.lines[0].nodeIds.indexOf(edit.nodeId),2,'skip the zero-length first pair');
  const before=structuredClone(map);
  for(const options of [{insertIndex:0},{insertIndex:99},{insertIndex:1.5},{nodeId:'missing'}])assert.equal(beginRoutePointEdit(map,'route',{x:0,y:0},{...options,createId}),null);
  assert.equal(beginRoutePointEdit(map,'route',{x:Infinity,y:0},{createId}),null);
  assert.equal(moveRoutePoint(map,edit,{x:NaN,y:0}),false);
  assert.deepEqual(map,before);
  const zero={nodes:[{id:'a',x:0,y:0},{id:'b',x:0,y:0}],lines:[{id:'zero',nodeIds:['a','b']}]};
  assert.deepEqual(routeEditHandles(zero,'zero'),[]);
  assert.equal(beginRoutePointEdit(zero,'zero',{x:0,y:0},{createId}),null);
  assert.equal(beginRoutePointEdit({nodes:map.nodes,lines:[{id:'one',nodeIds:['a']}]},'one',{x:0,y:0},{createId}),null);
});
