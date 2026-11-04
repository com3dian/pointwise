import test from 'node:test';
import assert from 'node:assert/strict';
import { snapPoint, routePoints, roundedPath, nearestOnLine, getBounds } from '../dist/geometry.js';

test('snap handles negative coordinates, custom spacing and disabled grids', () => {
  assert.deepEqual(snapPoint({ x: 31, y: -32 }), { x: 40, y: -40 });
  assert.deepEqual(snapPoint({ x: 12, y: 14 }, 5), { x: 10, y: 15 });
  assert.deepEqual(snapPoint({ x: 12, y: 14 }, 0), { x: 12, y: 14 });
});

test('routes preserve locations and produce only metro angles in every quadrant', () => {
  const nodes = [{ x: 0, y: 0 }, { x: 80, y: 30 }, { x: -25, y: 90 }, { x: -50, y: -80 }];
  const result = routePoints(nodes);
  for (const node of nodes) assert(result.some((point) => point.x === node.x && point.y === node.y));
  for (let index = 1; index < result.length; index += 1) {
    const dx = Math.abs(result[index].x - result[index - 1].x);
    const dy = Math.abs(result[index].y - result[index - 1].y);
    assert(dx === 0 || dy === 0 || dx === dy);
  }
  assert.deepEqual(result.slice(0, 3), [{ x: 0, y: 0 }, { x: 30, y: 30 }, { x: 80, y: 30 }]);
  assert.deepEqual(nodes[1], { x: 80, y: 30 });
});

test('routes remove duplicate locations and handle empty and straight lines', () => {
  assert.deepEqual(routePoints([]), []);
  assert.deepEqual(routePoints([{ x: 2, y: 2 }, { x: 2, y: 2 }]), [{ x: 2, y: 2 }]);
  assert.deepEqual(routePoints([{ x: 0, y: 0 }, { x: 20, y: 0 }]), [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
});

test('orthogonal routes preserve stops and insert horizontal-first right-angle elbows', () => {
  const nodes = [{x:0,y:0},{x:80,y:30},{x:-25,y:90},{x:-50,y:-80}];
  const points = routePoints(nodes, 'orthogonal');
  assert.deepEqual(points.slice(0,3), [{x:0,y:0},{x:80,y:0},{x:80,y:30}]);
  for (const node of nodes) assert(points.some(p => p.x === node.x && p.y === node.y));
  for (let i=1; i<points.length; i++) assert(points[i].x === points[i-1].x || points[i].y === points[i-1].y);
  assert.deepEqual(routePoints([{x:2,y:2},{x:2,y:2}], 'orthogonal'), [{x:2,y:2}]);
  assert.deepEqual(routePoints(nodes, 'unsupported'), routePoints(nodes));
  assert.deepEqual(nearestOnLine({x:50,y:3},nodes.slice(0,2),'orthogonal'), {x:50,y:0,distance:3,insertIndex:1});
  assert.deepEqual(nearestOnLine({x:82,y:15},nodes.slice(0,2),'orthogonal'), {x:80,y:15,distance:2,insertIndex:1});
});

test('rounded corners cap the radius to protect neighboring short legs', () => {
  assert.equal(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }], 18),
    'M 0 0 L 7 0 Q 10 0 10 3 L 10 6');
  assert.equal(roundedPath([]), '');
  assert.equal(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]), 'M 0 0 L 10 0 L 20 0');
});

test('corner styles produce distinct sharp, soft, circular and beveled paths', () => {
  const points=[{x:0,y:0},{x:100,y:0},{x:100,y:100}];
  assert.equal(roundedPath(points,20,[],'sharp'),'M 0 0 L 100 0 L 100 100');
  assert.equal(roundedPath(points,20,[],'rounded'),'M 0 0 L 80 0 Q 100 0 100 20 L 100 100');
  assert.equal(roundedPath(points,20,[],'circular'),'M 0 0 L 80 0 A 20 20 0 0 1 100 20 L 100 100');
  assert.equal(roundedPath(points,20,[],'bevel'),'M 0 0 L 80 0 L 100 20 L 100 100');
  assert.equal(roundedPath(points,20,[],'unknown'),roundedPath(points,20));
  for(const style of ['sharp','rounded','circular','bevel']) {
    assert.equal(roundedPath(points,0,[],style),'M 0 0 L 100 0 L 100 100');
    assert.equal(roundedPath(points,20,[{x:100,y:0,maxDeviation:0}],style),'M 0 0 L 100 0 L 100 100');
  }
});

test('circular fillets have tangent radii and correct sweep for mirrored and diagonal turns', () => {
  const clockwise=roundedPath([{x:0,y:0},{x:100,y:0},{x:100,y:100}],20,[],'circular');
  const counterclockwise=roundedPath([{x:0,y:0},{x:100,y:0},{x:100,y:-100}],20,[],'circular');
  assert.match(clockwise,/A 20 20 0 0 1 100 20/);
  assert.match(counterclockwise,/A 20 20 0 0 0 100 -20/);
  const diagonal=roundedPath([{x:0,y:0},{x:100,y:0},{x:200,y:100}],20,[],'circular');
  assert.match(diagonal,/A 48\.284 48\.284 0 0 1 114\.142 14\.142/);
  for(const style of ['circular','bevel']) {
    const tight=roundedPath([{x:0,y:0},{x:10,y:0},{x:10,y:6}],200,[],style);
    assert.match(tight,/L 7 0/);
    assert.match(tight,/10 3 L 10 6$/);
    for(const points of [[],[{x:0,y:0}], [{x:0,y:0},{x:0,y:0},{x:10,y:0},{x:0,y:0}]]) {
      assert.ok(!/NaN|Infinity/.test(roundedPath(points,200,[],style)));
    }
  }
});

test('circular and bevel anchors use shape-specific midpoint deviation bounds', () => {
  const points=[{x:0,y:0},{x:100,y:0},{x:100,y:100}];
  const circular=roundedPath(points,40,[{x:100,y:0,maxDeviation:3}],'circular');
  const match=circular.match(/L ([\d.]+) 0 A ([\d.]+) [\d.]+ 0 0 1 100 ([\d.]+)/);
  assert.ok(match);
  const cutback=100-Number(match[1]);
  assert.ok(Math.abs(cutback*Math.tan(Math.PI/8)-3)<.001);
  const bevel=roundedPath(points,40,[{x:100,y:0,maxDeviation:3}],'bevel');
  const endpoints=bevel.match(/L ([\d.]+) 0 L 100 ([\d.]+)/);
  assert.ok(endpoints);
  const mx=(Number(endpoints[1])+100)/2,my=Number(endpoints[2])/2;
  assert.ok(Math.abs(Math.hypot(mx-100,my)-3)<.001);
});

test('station anchors bound midpoint deviation while unanchored bends retain their radius', () => {
  const points = [{ x:0,y:0 }, { x:100,y:0 }, { x:100,y:100 }, { x:200,y:100 }];
  const path = roundedPath(points, 40, [{ x:100,y:0,maxDeviation:3 }]);
  const match = path.match(/L ([\d.-]+) ([\d.-]+) Q 100 0 ([\d.-]+) ([\d.-]+)/);
  assert.ok(match, 'The protected corner should remain smoothly rounded.');
  const [, entryX, entryY, exitX, exitY] = match.map(Number);
  const midpoint = { x:(entryX+200+exitX)/4, y:(entryY+exitY)/4 };
  assert.ok(Math.hypot(midpoint.x-100,midpoint.y) <= 3.001);
  assert.ok(Math.hypot(midpoint.x-100,midpoint.y) >= 2.999);
  assert.match(path, /L 100 60 Q 100 100 140 100/,
    'A bend without a station anchor should keep the requested radius.');
  assert.equal(roundedPath(points.slice(0,3),40), 'M 0 0 L 60 0 Q 100 0 100 40 L 100 100');
});

test('zero-deviation anchors keep interchanges exact and degenerate inputs remain finite', () => {
  const points = [{ x:0,y:0 }, { x:100,y:0 }, { x:100,y:100 }];
  assert.equal(roundedPath(points,160,[{x:100,y:0,maxDeviation:0}]), 'M 0 0 L 100 0 L 100 100');
  assert.equal(roundedPath(points,160,[{x:100,y:0,maxDeviation:-1}]), 'M 0 0 L 100 0 L 100 100');
  assert.equal(roundedPath(points,40,[{x:100,y:0,maxDeviation:NaN}]), roundedPath(points,40));
  const degenerate = [{ x:0,y:0 },{ x:0,y:0 },{ x:10,y:0 },{ x:0,y:0 }];
  assert.equal(roundedPath(degenerate,100,[{x:10,y:0,maxDeviation:0}]), 'M 0 0 L 10 0 L 0 0');
  assert.ok(!/NaN|Infinity/.test(roundedPath(degenerate,100,null)));
});

test('insertion maps generated elbows back to the source node pair', () => {
  const nodes = [{ x: 0, y: 0 }, { x: 100, y: 40 }, { x: 160, y: 40 }];
  assert.deepEqual(nearestOnLine({ x: 70, y: 45 }, nodes), { x: 70, y: 40, distance: 5, insertIndex: 1 });
  assert.deepEqual(nearestOnLine({ x: 140, y: 30 }, nodes), { x: 140, y: 40, distance: 10, insertIndex: 2 });
  const diagonal = nearestOnLine({ x: 20, y: 10 }, nodes);
  assert.equal(diagonal.x, 15);
  assert.equal(diagonal.y, 15);
  assert.equal(diagonal.insertIndex, 1);
  assert.equal(nearestOnLine({ x: 4, y: 5 }, []).distance, Infinity);
});

test('bounds provide padded extents and avoid zero dimensions', () => {
  assert.deepEqual(getBounds([{ x: -20, y: 30 }, { x: 100, y: 80 }], 10), { x: -30, y: 20, width: 140, height: 70 });
  assert.deepEqual(getBounds([], 0), { x: 0, y: 0, width: 1, height: 1 });
});
