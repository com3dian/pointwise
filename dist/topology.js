import { routePoints } from './geometry.js';
import { effectiveLine } from './styles.js';

const EPSILON = 1e-8;
const finitePoint = node => node && Number.isFinite(node.x) && Number.isFinite(node.y);
const samePoint = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < EPSILON;
const normalizeAngle = value => {
  const angle = Number((((value + 180) % 360 + 360) % 360 - 180).toFixed(6));
  return angle >= 180 ? -180 : angle || 0;
};
const angleGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * Rays followed by visible routes immediately around a station. Directions
 * refer to SVG/map coordinates: 0° points right and 90° points down.
 * The generated metro elbows, rather than the next station's bearing,
 * determine each tangent. Shared rays combine their line memberships.
 */
export function stationDirections(map, nodeId) {
  const nodes = new Map((map?.nodes || []).filter(finitePoint).map(node => [node.id, node]));
  const station = nodes.get(nodeId);
  if (!station) return [];
  const rays = [];

  function addRay(point, lineId) {
    if (!finitePoint(point) || samePoint(station, point)) return;
    const angle = normalizeAngle(Math.atan2(point.y - station.y, point.x - station.x) * 180 / Math.PI);
    let ray = rays.find(candidate => angleGap(candidate.angle, angle) < .01);
    if (!ray) { ray = { angle, lineIds: [] }; rays.push(ray); }
    if (!ray.lineIds.includes(lineId)) ray.lineIds.push(lineId);
  }

  for (const line of map?.lines || []) {
    if (!line || line.visible === false || !Array.isArray(line.nodeIds)) continue;
    const routing=effectiveLine(map,line).routing;
    const route = line.nodeIds.map(id => nodes.get(id));
    line.nodeIds.forEach((id, index) => {
      if (id !== nodeId) return;
      // Consecutive coincident stops do not create a direction. Look through
      // them to the first useful point, preserving the route's sequence.
      let previous = index - 1;
      while (previous >= 0 && (!route[previous] || samePoint(route[previous], station))) previous -= 1;
      if (previous >= 0) {
        const incoming = routePoints([route[previous], station],routing);
        addRay(incoming.at(-2), line.id);
      }
      let next = index + 1;
      while (next < route.length && (!route[next] || samePoint(route[next], station))) next += 1;
      if (next < route.length) {
        const outgoing = routePoints([station, route[next]],routing);
        addRay(outgoing[1], line.id);
      }
    });
  }
  return rays.sort((a, b) => a.angle - b.angle);
}
