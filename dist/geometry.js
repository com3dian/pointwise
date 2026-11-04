/** Geometry for schematic metro routes. No DOM or framework dependencies. */
const EPSILON = 1e-8;
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const isPoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const samePoint = (a, b) => distance(a, b) < EPSILON;
const copyPoint = ({ x, y }) => ({ x, y });

/** Round a point to the nearest grid intersection. */
export function snapPoint(point, grid = 20) {
  if (!isPoint(point)) return { x: 0, y: 0 };
  if (!Number.isFinite(grid) || grid <= 0) return copyPoint(point);
  return {
    x: Math.round(point.x / grid) * grid || 0,
    y: Math.round(point.y / grid) * grid || 0,
  };
}

/** Connect two locations using the requested schematic grid. */
function routePair(start, end, routing = 'octilinear') {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  const points = [copyPoint(start)];
  if (routing === 'orthogonal' && Math.abs(dx) > EPSILON && Math.abs(dy) > EPSILON) {
    points.push({ x: end.x, y: start.y });
  } else if (routing !== 'orthogonal' && diagonal > EPSILON && Math.abs(Math.abs(dx) - Math.abs(dy)) > EPSILON) {
    points.push({
      x: start.x + Math.sign(dx) * diagonal,
      y: start.y + Math.sign(dy) * diagonal,
    });
  }
  if (!samePoint(start, end)) points.push(copyPoint(end));
  return points;
}

/**
 * Return a polyline on a 45° grid, or use only horizontal/vertical legs when
 * routing is orthogonal. Orthogonal pairs travel horizontally first.
 * Inputs are not mutated, and every supplied valid location is preserved.
 */
export function routePoints(nodes, routing = 'octilinear') {
  const valid = (nodes || []).filter(isPoint);
  if (!valid.length) return [];
  const points = [copyPoint(valid[0])];
  for (let index = 1; index < valid.length; index += 1) {
    for (const point of routePair(valid[index - 1], valid[index], routing).slice(1)) {
      if (!samePoint(points.at(-1), point)) points.push(point);
    }
  }
  return points;
}

const format = (number) => String(Number(number.toFixed(3)));
const coordinates = (point) => `${format(point.x)} ${format(point.y)}`;

/**
 * Make an SVG path with soft quadratic, circular, beveled or sharp corners.
 * Radius is the tangent cutback distance, capped at half of each neighboring
 * leg. Optional anchors cap the nearest corner midpoint's deviation so stops
 * remain on the route. A zero deviation keeps an interchange exactly fixed.
 */
export function roundedPath(points, radius = 18, anchors = [], style = 'rounded') {
  const clean = (points || []).filter(isPoint).filter((point, index, all) =>
    index === 0 || !samePoint(point, all[index - 1]));
  if (!clean.length) return '';
  let path = `M ${coordinates(clean[0])}`;
  const cornerStyle = ['sharp', 'rounded', 'circular', 'bevel'].includes(style) ? style : 'rounded';
  const requestedRadius = cornerStyle !== 'sharp' && Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const protectedCorners = (Array.isArray(anchors) ? anchors : [])
    .filter(anchor => isPoint(anchor) && Number.isFinite(anchor.maxDeviation));
  for (let index = 1; index < clean.length - 1; index += 1) {
    const previous = clean[index - 1];
    const corner = clean[index];
    const next = clean[index + 1];
    const previousLength = distance(previous, corner);
    const nextLength = distance(corner, next);
    const cross = (corner.x - previous.x) * (next.y - corner.y)
      - (corner.y - previous.y) * (next.x - corner.x);
    let cornerRadius = Math.min(requestedRadius, previousLength / 2, nextLength / 2);
    if (cornerRadius <= EPSILON || Math.abs(cross) < EPSILON) {
      path += ` L ${coordinates(corner)}`;
      continue;
    }
    const unitSum = Math.hypot(
      (previous.x - corner.x) / previousLength + (next.x - corner.x) / nextLength,
      (previous.y - corner.y) / previousLength + (next.y - corner.y) / nextLength,
    );
    const dot = ((corner.x - previous.x) * (next.x - corner.x)
      + (corner.y - previous.y) * (next.y - corner.y)) / (previousLength * nextLength);
    const turnAngle = Math.acos(Math.max(-1, Math.min(1, dot)));
    // Each shape's midpoint offset is linear in tangent cutback. These exact
    // factors let the same anchor limit apply without sampling SVG curves.
    const deviationPerUnit = cornerStyle === 'circular' ? Math.tan(turnAngle / 4)
      : cornerStyle === 'bevel' ? unitSum / 2 : unitSum / 4;
    for (const anchor of protectedCorners) {
      if (samePoint(corner, anchor) && deviationPerUnit > EPSILON) {
        cornerRadius = Math.min(cornerRadius, Math.max(0, anchor.maxDeviation) / deviationPerUnit);
      }
    }
    if (cornerRadius <= EPSILON) {
      path += ` L ${coordinates(corner)}`;
      continue;
    }
    const entry = {
      x: corner.x + (previous.x - corner.x) * cornerRadius / previousLength,
      y: corner.y + (previous.y - corner.y) * cornerRadius / previousLength,
    };
    const exit = {
      x: corner.x + (next.x - corner.x) * cornerRadius / nextLength,
      y: corner.y + (next.y - corner.y) * cornerRadius / nextLength,
    };
    path += ` L ${coordinates(entry)}`;
    if (cornerStyle === 'bevel') {
      path += ` L ${coordinates(exit)}`;
    } else if (cornerStyle === 'circular') {
      // A circle tangent to both legs has R = cutback / tan(turn/2).
      // SVG uses clockwise sweep in its downward-positive coordinate system.
      const circleRadius = cornerRadius / Math.tan(turnAngle / 2);
      if (Number.isFinite(circleRadius) && circleRadius >= 0.0005) {
        path += ` A ${format(circleRadius)} ${format(circleRadius)} 0 0 ${cross > 0 ? 1 : 0} ${coordinates(exit)}`;
      } else {
        path += ` L ${coordinates(exit)}`;
      }
    } else {
      path += ` Q ${coordinates(corner)} ${coordinates(exit)}`;
    }
  }
  if (clean.length > 1) path += ` L ${coordinates(clean.at(-1))}`;
  return path;
}

/** Closest position on a segment, including endpoints. */
function projectPoint(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const squaredLength = dx * dx + dy * dy;
  const t = squaredLength > EPSILON
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squaredLength))
    : 0;
  return { x: start.x + t * dx, y: start.y + t * dy };
}

/**
 * Find a stop insertion position on the routed polyline. insertIndex refers to
 * the ORIGINAL node array, even where a generated elbow is the nearest point.
 * Empty lines return the supplied point with distance Infinity and index 0.
 */
export function nearestOnLine(point, nodes, routing = 'octilinear') {
  const target = isPoint(point) ? point : { x: 0, y: 0 };
  const valid = (nodes || []).map((node, index) => ({ node, index })).filter(({ node }) => isPoint(node));
  if (!valid.length) return { ...copyPoint(target), distance: Infinity, insertIndex: 0 };
  let nearest = {
    ...copyPoint(valid[0].node),
    distance: distance(target, valid[0].node),
    insertIndex: valid[0].index + 1,
  };
  for (let index = 1; index < valid.length; index += 1) {
    const routed = routePair(valid[index - 1].node, valid[index].node, routing);
    for (let segment = 1; segment < routed.length; segment += 1) {
      const position = projectPoint(target, routed[segment - 1], routed[segment]);
      const gap = distance(target, position);
      if (gap < nearest.distance) {
        nearest = { ...position, distance: gap, insertIndex: valid[index].index };
      }
    }
  }
  return nearest;
}

/** Bounding box with consistent padding, including useful empty/single cases. */
export function getBounds(nodes, padding = 100) {
  const valid = (nodes || []).filter(isPoint);
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 100;
  const xs = valid.map((point) => point.x);
  const ys = valid.map((point) => point.y);
  const minX = valid.length ? Math.min(...xs) : 0;
  const minY = valid.length ? Math.min(...ys) : 0;
  const maxX = valid.length ? Math.max(...xs) : 0;
  const maxY = valid.length ? Math.max(...ys) : 0;
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(1, maxX - minX + pad * 2),
    height: Math.max(1, maxY - minY + pad * 2),
  };
}
