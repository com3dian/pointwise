import test from 'node:test';
import assert from 'node:assert/strict';
import {removeMapItem,repairEmptyRoutes} from '../dist/deletion.js';
import {validateMap} from '../dist/model.js';
import {buildSVG} from '../dist/export.js';
const fixture=()=>({version:1,title:'Deletion',nodes:[{id:'a',x:0,y:0,name:'A'},{id:'bend1',x:50,y:0,kind:'bend'},{id:'bend2',x:50,y:50,kind:'bend'},{id:'b',x:100,y:50,name:'B'}],lines:[{id:'line',name:'Route',nodeIds:['a','bend1','bend2','b'],color:'#123456'}]});

test('deleting every stop from a reshaped route removes the leftover line and hidden bends',()=>{
 const map=fixture();removeMapItem(map,{type:'node',id:'a'});
 assert.equal(map.lines.length,1);assert.equal(map.nodes.length,3);
 removeMapItem(map,{type:'node',id:'b'});
 assert.deepEqual(map.lines,[]);assert.deepEqual(map.nodes,[]);
 const loaded=validateMap(JSON.parse(JSON.stringify(map)));
 assert.deepEqual(loaded.lines,[]);assert.doesNotMatch(buildSVG(loaded),/<path/);
});
test('removing a route preserves shared stations and bends used by another route',()=>{
 const map=fixture();map.nodes.push({id:'other',x:200,y:50,name:'Other'});
 map.lines.push({id:'other-line',nodeIds:['bend2','b','other']});
 removeMapItem(map,{type:'line',id:'line'});
 assert.deepEqual(map.lines.map(l=>l.id),['other-line']);
 assert.deepEqual(map.nodes.map(n=>n.id),['bend2','b','other']);
});
test('last-stop cleanup cannot delete another route or standalone station',()=>{
 const map=fixture();map.nodes.push({id:'other',x:200,y:50},{id:'standalone',x:300,y:0});
 map.lines.push({id:'other-line',nodeIds:['bend2','other']});
 removeMapItem(map,{type:'node',id:'a'});removeMapItem(map,{type:'node',id:'b'});
 assert.deepEqual(map.lines.map(l=>l.id),['other-line']);
 assert.deepEqual(map.nodes.map(n=>n.id),['bend2','other','standalone']);
});
test('removing a bend straightens the route without deleting remaining stations',()=>{
 const map=fixture();removeMapItem(map,{type:'node',id:'bend1'});
 assert.deepEqual(map.lines[0].nodeIds,['a','bend2','b']);
 assert.deepEqual(map.nodes.map(n=>n.id),['a','bend2','b']);
});
test('unrelated in-progress empty routes survive deletion and snapshots can undo cleanup',()=>{
 const map=fixture();map.lines.push({id:'draft',nodeIds:[]});const before=structuredClone(map);
 removeMapItem(map,{type:'node',id:'a'});removeMapItem(map,{type:'node',id:'b'});
 assert.deepEqual(map.lines,[{id:'draft',nodeIds:[]}]);assert.deepEqual(map.nodes,[]);
 const restored=validateMap(before);assert.equal(restored.nodes.length,4);assert.equal(restored.lines.length,2);
});

test('saved empty, bend-only and coincident routes are repaired while valid hidden routes remain',()=>{
 const map=fixture();
 map.nodes.push({id:'orphan-bend',kind:'bend',x:999,y:999},{id:'single',x:300,y:0},{id:'same',x:300,y:0});
 map.lines.push({id:'empty',nodeIds:[]},{id:'bends',nodeIds:['bend1','bend2']},{id:'single',nodeIds:['single']},{id:'coincident',nodeIds:['single','same']});
 map.lines[0].visible=false;
 const before=structuredClone(map);
 assert.equal(repairEmptyRoutes(map),true);
 assert.deepEqual(map.lines.map(l=>l.id),['line']);assert.equal(map.lines[0].visible,false);
 assert(map.nodes.some(n=>n.id==='single'));assert(map.nodes.some(n=>n.id==='same'));
 assert(!map.nodes.some(n=>n.id==='orphan-bend'));
 assert.equal(repairEmptyRoutes(map),false);
 assert.equal(before.lines.length,5);
});
test('repairing a stationless saved document yields a truly blank route layer',()=>{
 const map=fixture();map.nodes=map.nodes.filter(n=>n.kind==='bend');map.lines[0].nodeIds=['bend1','bend2'];
 assert.equal(repairEmptyRoutes(map),true);
 assert.deepEqual(map.nodes,[]);assert.deepEqual(map.lines,[]);
 assert.doesNotMatch(buildSVG(validateMap(map)),/<path/);
});
