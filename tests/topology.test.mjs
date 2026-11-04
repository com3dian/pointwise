import test from 'node:test';
import assert from 'node:assert/strict';
import { stationDirections } from '../dist/topology.js';

const node = (id, x, y) => ({ id, x, y });
const line = (id, nodeIds, visible = true) => ({ id, nodeIds, visible });

test('a horizontal and diagonal interchange uses the four actual nonorthogonal rays', () => {
  const map = {
    nodes: [node('c', 0, 0), node('w', -100, 0), node('e', 100, 0), node('nw', -100, -100), node('se', 100, 100)],
    lines: [line('horizontal', ['w', 'c', 'e']), line('diagonal', ['nw', 'c', 'se'])],
  };
  assert.deepEqual(stationDirections(map, 'c'), [
    { angle: -180, lineIds: ['horizontal'] },
    { angle: -135, lineIds: ['diagonal'] },
    { angle: 0, lineIds: ['horizontal'] },
    { angle: 45, lineIds: ['diagonal'] },
  ]);
});

test('junctions keep endpoint arms, merge shared directions, and ignore hidden lines', () => {
  const map = {
    nodes: [node('c', 0, 0), node('w', -100, 0), node('e', 100, 0), node('n', 0, -100), node('s', 0, 100)],
    lines: [line('through', ['w', 'c', 'e']), line('branch', ['c', 'n']), line('shared', ['c', 'e']), line('hidden', ['c', 's'], false)],
  };
  assert.deepEqual(stationDirections(map, 'c'), [
    { angle: -180, lineIds: ['through'] },
    { angle: -90, lineIds: ['branch'] },
    { angle: 0, lineIds: ['through', 'shared'] },
  ]);
  assert.deepEqual(stationDirections(map, 'n'), [{ angle: 90, lineIds: ['branch'] }]);
});

test('generated elbows determine local tangents rather than station-to-station bearings', () => {
  const map = {
    nodes: [node('c', 0, 0), node('a', -100, -40), node('b', 100, 40)],
    lines: [line('route', ['a', 'c', 'b'])],
  };
  assert.deepEqual(stationDirections(map, 'c'), [
    { angle: -180, lineIds: ['route'] },
    { angle: 45, lineIds: ['route'] },
  ]);
});

test('cross directions follow global routing while a local route can retain diagonals',()=>{
  const map={defaults:{routing:'orthogonal'},nodes:[node('c',0,0),node('a',-100,-40),node('b',100,40)],lines:[{...line('route',['a','c','b']),styleMode:'global'}]};
  assert.deepEqual(stationDirections(map,'c').map(ray=>ray.angle),[-90,0]);
  Object.assign(map.lines[0],{styleMode:'custom',routing:'octilinear'});
  assert.deepEqual(stationDirections(map,'c').map(ray=>ray.angle),[-180,45]);
});

test('loops, repeated IDs and coincident stops retain finite unique directions', () => {
  const map = {
    nodes: [node('c', 0, 0), node('same', 0, 0), node('e', 100, 0), node('s', 0, 100)],
    lines: [line('loop', ['c', 'same', 'e', 's', 'same', 'c']), line('duplicate', ['c', 'c', 'e'])],
  };
  const rays = stationDirections(map, 'c');
  assert.deepEqual(rays, [
    { angle: 0, lineIds: ['loop', 'duplicate'] },
    { angle: 90, lineIds: ['loop'] },
  ]);
  assert.ok(rays.every(ray => Number.isFinite(ray.angle)));
});

test('standalone, missing and degenerate stations have no invented connecting arms', () => {
  const map = { nodes: [node('c', 0, 0), node('same', 0, 0)], lines: [line('empty', []), line('one', ['c']), line('zero', ['c', 'same'])] };
  assert.deepEqual(stationDirections(map, 'c'), []);
  assert.deepEqual(stationDirections(map, 'missing'), []);
  assert.deepEqual(stationDirections(null, 'c'), []);
});

test('equivalent westward rays merge across the angle wrap without mutating the map', () => {
  const map = {
    nodes: [node('c', 0, 0), node('above', -100, -1e-9), node('below', -100, 1e-9)],
    lines: [line('first', ['c', 'above']), line('second', ['c', 'below'])],
  };
  const before = structuredClone(map);
  assert.deepEqual(stationDirections(map, 'c'), [{ angle: -180, lineIds: ['first', 'second'] }]);
  assert.deepEqual(map, before);
});
