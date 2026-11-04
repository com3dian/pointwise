import test from 'node:test';
import assert from 'node:assert/strict';
import {lineEndpoint,extensionAnchor,appendRouteStop} from '../dist/extension.js';
import {validateMap} from '../dist/model.js';
import {buildSVG} from '../dist/export.js';
const fixture=()=>({version:1,title:'Extend',nodes:[{id:'a',x:0,y:0,name:'A'},{id:'bend',x:50,y:0,kind:'bend'},{id:'b',x:100,y:50,name:'B'},{id:'c',x:-100,y:0,name:'C'}],lines:[{id:'route',name:'Main',nodeIds:['a','bend','b'],color:'#123456'},{id:'connection',nodeIds:['a','c'],color:'#654321'}]});
test('first and last stops are extendable but interior stops and closed loops are not endpoints',()=>{
 const line={nodeIds:['a','middle','b']};
 assert.equal(lineEndpoint(line,'a'),'start');assert.equal(lineEndpoint(line,'b'),'end');assert.equal(lineEndpoint(line,'middle'),null);
 assert.equal(lineEndpoint({nodeIds:['a','b','a']},'a'),null);assert.equal(lineEndpoint({nodeIds:[]},'a'),null);
 assert.equal(lineEndpoint({nodeIds:['a']},'a'),'end');
});
test('extending from the first stop prepends points without reversing or moving the existing route',()=>{
 const map=fixture(),before=structuredClone(map),route=map.lines[0];
 map.nodes.push({id:'new',x:-50,y:-50,name:'New'});appendRouteStop(route,'new','start');
 assert.deepEqual(route.nodeIds,['new','a','bend','b']);assert.equal(extensionAnchor(route,'start'),'new');
 assert.deepEqual(map.lines[1],before.lines[1]);assert.deepEqual(map.nodes.slice(0,4),before.nodes);
 appendRouteStop(route,'c','start');assert.deepEqual(route.nodeIds,['c','new','a','bend','b']);
 const loaded=validateMap(JSON.parse(JSON.stringify(map)));assert.deepEqual(loaded.lines[0].nodeIds,route.nodeIds);assert.match(buildSVG(loaded),/New/);
});
test('extending from the other end appends and cannot duplicate the active endpoint',()=>{
 const route={nodeIds:['a','b']};assert.equal(appendRouteStop(route,'b','end'),false);
 assert.equal(appendRouteStop(route,'c','end'),true);assert.deepEqual(route.nodeIds,['a','b','c']);
 assert.equal(appendRouteStop(route,'a','start'),false);assert.equal(extensionAnchor(route,'end'),'c');
});
test('a first-end extension can join an existing stop or close a loop without changing shared membership',()=>{
 const map=fixture(),route=map.lines[0],other=structuredClone(map.lines[1]);
 appendRouteStop(route,'c','start');assert.deepEqual(map.lines[1],other);
 appendRouteStop(route,'b','start');assert.deepEqual(route.nodeIds,['b','c','a','bend','b']);assert.equal(lineEndpoint(route,'b'),null);
 assert.doesNotThrow(()=>validateMap(map));
});
