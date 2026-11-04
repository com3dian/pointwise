/** Shared station glyphs for the editor, picker, and exported SVG drawing. */
export const SYMBOL_TYPES = [
  { id: 'auto', label: 'Automatic', description: 'A simple stop; shared stops become larger interchange circles.' },
  { id: 'circle', label: 'Circle', description: 'A classic hollow station circle.' },
  { id: 'disc', label: 'Filled dot', description: 'A route-colored dot with an outlined edge.' },
  { id: 'capsule', label: 'Capsule', description: 'One continuous, rounded interchange marker.' },
  { id: 'open-capsule', label: 'Open capsule', description: 'A transparent capsule that reveals the routes beneath it.' },
  { id: 'pill-dots', label: 'Capsule with dots', description: 'A capsule containing a colored dot for each connected route.' },
  { id: 'linked', label: 'Linked circles', description: 'Two hollow circles joined by a narrow, outlined bridge.' },
  { id: 'linked-dots', label: 'Linked route dots', description: 'Linked circles with different route colors inside them.' },
  { id: 'double-circle', label: 'Touching circles', description: 'A pair of touching circular markers with colored centers.' },
  { id: 'cross', label: 'Cross', description: 'A connected marker whose arms follow crossing routes or your own angles.' },
  { id: 'segmented-ring', label: 'Segmented ring', description: 'An open ring divided into the connected route colors.' },
  { id: 'orbital', label: 'Orbital ring', description: 'An interchange ring with two small connection circles.' },
];

const shapes = new Set(SYMBOL_TYPES.map(type => type.id));
const finite = (value, fallback, min, max) => Number.isFinite(value)
  ? Math.max(min, Math.min(max, value)) : fallback;
const number = value => String(Number(value.toFixed(3)));
const color = (value, fallback) => typeof value === 'string' && /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})$/i.test(value) ? value : fallback;

/** Normalize optional appearance fields without altering old saved maps. */
export function normalizeSymbol(node = {}) {
  return {
    shape: shapes.has(node.symbol) ? node.symbol : 'auto',
    angle: finite(node.symbolAngle, 0, -180, 180),
    size: finite(node.symbolSize, 1, 0.6, 3),
    length: finite(node.symbolLength, 28, 12, 60),
    outline: ['line','custom'].includes(node.symbolOutline) ? node.symbolOutline : 'ink',
    fill: ['transparent','custom'].includes(node.symbolFill) ? node.symbolFill : 'paper',
  };
}

export function normalizeSymbolColors(node={}) {
  const hex=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
  return {outlineColor:hex(node.symbolOutlineColor,'#344038'),fillColor:hex(node.symbolFillColor,'#ffffff')};
}

const defaultCrossArms = (length = 18) => [0, 90, 180, -90].map(angle => ({ angle, length }));
const wrapAngle = angle => ((angle + 180) % 360 + 360) % 360 - 180;

/** Normalize editable arm values without changing their order in the inspector. */
export function normalizeCrossArms(arms) {
  if (!Array.isArray(arms)) return defaultCrossArms();
  const clean = arms.slice(0, 8).filter(arm => arm && Number.isFinite(arm.angle)).map(arm => ({
    angle: finite(arm.angle, 0, -180, 180),
    length: finite(arm.length, 18, 6, 60),
  }));
  return clean.length ? clean : defaultCrossArms();
}

/** Resolve inferred route directions or the saved custom arm configuration. */
export function resolveCrossArms(node = {}, directions = []) {
  const defaultLength = normalizeSymbol(node).length / 2 + 4;
  const inferred = Array.isArray(directions)
    ? directions.filter(arm => arm && Number.isFinite(arm.angle)).slice(0, 8).map(arm => ({
      angle: wrapAngle(arm.angle), length: finite(arm.length, defaultLength, 6, 60),
    })) : [];
  const chosen = node.symbolCrossMode === 'manual'
    ? normalizeCrossArms(node.symbolCrossArms)
    : inferred.length ? inferred : defaultCrossArms(defaultLength);
  // Coincident rays represent one arm, not overlapping glyphs. Taking the
  // longest also keeps nearly parallel user edits finite and predictable.
  const merged = [];
  for (const arm of chosen) {
    const existing = merged.find(other => Math.abs(wrapAngle(other.angle - arm.angle)) < 0.01);
    if (existing) existing.length = Math.max(existing.length, arm.length);
    else merged.push({ ...arm });
  }
  return merged;
}

/**
 * A conservative radius around the full symbol, safe at every orientation.
 * The app uses this for hit targets, label clearance, and SVG export bounds.
 */
export function symbolExtent(node = {}, interchange = false, directions = []) {
  const symbol = normalizeSymbol(node);
  const half = symbol.length / 2;
  const armHalfWidth = finite(node.symbolArmWidth, 10, 6, 24) / 2;
  let extent;
  switch (symbol.shape) {
    case 'auto': extent = interchange ? 11 : 8; break;
    case 'circle': case 'disc': extent = 10; break;
    case 'capsule': case 'open-capsule': case 'pill-dots':
      extent = Math.hypot(half + 11, 11); break;
    case 'linked': case 'linked-dots': extent = half + 10; break;
    case 'double-circle': extent = symbol.length + 2; break;
    case 'cross': extent = Math.hypot(Math.max(...resolveCrossArms(node, directions).map(arm => arm.length)), armHalfWidth) + (node.symbolCornerStyle === 'sharp' ? 3 : 2); break;
    case 'segmented-ring': extent = 17; break;
    case 'orbital': extent = 23; break;
    default: extent = 11;
  }
  return extent * symbol.size;
}

const crossProduct = (a, b) => a.x * b.y - a.y * b.x;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

/** Segment intersection; parallel overlap vertices already exist in the input. */
function segmentIntersection(a, b, c, d) {
  const r = subtract(b, a), s = subtract(d, c), denominator = crossProduct(r, s);
  if (Math.abs(denominator) < 1e-9) return null;
  const offset = subtract(c, a);
  const t = crossProduct(offset, s) / denominator;
  const u = crossProduct(offset, r) / denominator;
  if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

/**
 * Union ray strips into one closed silhouette. Each rectangle and the central
 * disk contains the origin, so their union is star-shaped and has no holes.
 * Polygon vertices and edge intersections are the only possible changes of
 * boundary edge; at each of their angles, keep the outermost ray intersection.
 * This avoids the interior borders that overlapping stroked arms would create.
 */
function crossSilhouette(arms, halfWidth = 5) {
  const polygons = arms.map(arm => {
    const angle = arm.angle * Math.PI / 180;
    const u = { x: Math.cos(angle), y: Math.sin(angle) };
    const n = { x: -u.y * halfWidth, y: u.x * halfWidth };
    const end = { x: u.x * arm.length, y: u.y * arm.length };
    return [n, { x: end.x + n.x, y: end.y + n.y }, { x: end.x - n.x, y: end.y - n.y }, { x: -n.x, y: -n.y }];
  });
  // A small round hub makes even a single branch, a T-junction, or a cluster
  // of closely spaced branches one connected, well-defined polygon.
  polygons.push(Array.from({ length: 16 }, (_, i) => ({
    x: Math.cos(i * Math.PI / 8) * halfWidth,
    y: Math.sin(i * Math.PI / 8) * halfWidth,
  })));
  const edges = polygons.flatMap(points => points.map((start, i) => [start, points[(i + 1) % points.length]]));
  const candidates = polygons.flat();
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const crossing = segmentIntersection(...edges[i], ...edges[j]);
      if (crossing && Math.hypot(crossing.x, crossing.y) > 1e-8) candidates.push(crossing);
    }
  }
  const angles = [...new Set(candidates.filter(p => Math.hypot(p.x, p.y) > 1e-8)
    .map(p => Number(Math.atan2(p.y, p.x).toFixed(10))))].sort((a, b) => a - b);
  const boundary = angles.map(angle => {
    const ray = { x: Math.cos(angle), y: Math.sin(angle) };
    let length = halfWidth;
    for (const [a, b] of edges) {
      const edge = subtract(b, a), denominator = crossProduct(ray, edge);
      if (Math.abs(denominator) < 1e-9) continue;
      const distance = crossProduct(a, edge) / denominator;
      const t = crossProduct(a, ray) / denominator;
      if (distance >= 0 && t >= -1e-8 && t <= 1 + 1e-8) length = Math.max(length, distance);
    }
    return { x: ray.x * length, y: ray.y * length };
  }).filter((point, i, all) => i === 0 || Math.hypot(point.x - all[i - 1].x, point.y - all[i - 1].y) > 1e-5);
  return boundary.map((point, i) => `${i ? 'L' : 'M'} ${number(point.x)} ${number(point.y)}`).join(' ') + ' Z';
}

function arc(radius, start, end) {
  const a = start * Math.PI / 180, b = end * Math.PI / 180;
  return `M ${number(radius * Math.cos(a))} ${number(radius * Math.sin(a))} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${number(radius * Math.cos(b))} ${number(radius * Math.sin(b))}`;
}

/**
 * Render one self-contained SVG symbol; all input used in markup is normalized.
 * Elongated symbols lie on the local X axis. Rotate 90° for a vertical marker.
 */
export function renderStationSymbol(node = {}, options = {}) {
  const symbol = normalizeSymbol(node);
  const ink = color(options.ink, '#344038');
  const paper = color(options.paper, '#f8f9f5');
  const supplied = Array.isArray(options.colors) ? options.colors : ['#4068e8'];
  const colors = supplied.length ? supplied.map(value => color(value, '#4068e8')) : ['#4068e8'];
  const first = colors[0], second = colors[1] || first;
  const interchange = options.interchange === true;
  const paints=normalizeSymbolColors(node);
  const outline = symbol.outline === 'custom' ? paints.outlineColor : symbol.outline === 'line' ? first : symbol.shape === 'auto'
    ? interchange ? ink : first
    : ink;
  const fill = symbol.fill === 'custom' ? paints.fillColor : symbol.fill === 'transparent' ? 'none' : paper;
  const x = finite(node.x, 0, -100000, 100000), y = finite(node.y, 0, -100000, 100000);
  const half = symbol.length / 2;
  const circle = (cx, cy, radius, inside = fill, edge = outline, width = 3) =>
    `<circle cx="${number(cx)}" cy="${number(cy)}" r="${number(radius)}" fill="${inside}" stroke="${edge}" stroke-width="${width}"/>`;
  const pill = (inside = fill, edge = outline, width = 3) =>
    `<rect x="${number(-half - 7.5)}" y="-7.5" width="${number(symbol.length + 15)}" height="15" rx="7.5" fill="${inside}" stroke="${edge}" stroke-width="${width}"/>`;
  let body = '';
  let crossMetadata = '';
  switch (symbol.shape) {
    case 'auto': body = circle(0, 0, interchange ? 9 : 6); break;
    case 'circle': body = circle(0, 0, 8); break;
    case 'disc': body = circle(0, 0, 8, first); break;
    case 'capsule': body = pill(); break;
    case 'open-capsule':
      // A paper halo separates the border from the crossing routes, while the
      // actual center remains transparent rather than hiding their colors.
      body = pill('none', paper, 7) + pill('none', outline, 2.5);
      break;
    case 'pill-dots':
      body = pill() + circle(-half, 0, 4.2, first, first, 0) + circle(half, 0, 4.2, second, second, 0);
      break;
    case 'linked': case 'linked-dots': {
      const path = `M ${number(-half)} 0 H ${number(half)}`;
      body = `<path d="${path}" fill="none" stroke="${outline}" stroke-width="9" stroke-linecap="round"/><path d="${path}" fill="none" stroke="${paper}" stroke-width="4" stroke-linecap="round"/>`;
      body += circle(-half, 0, 7.5) + circle(half, 0, 7.5, fill, symbol.outline === 'line' ? second : outline);
      if (symbol.shape === 'linked-dots') body += circle(-half, 0, 4.2, first, first, 0) + circle(half, 0, 4.2, second, second, 0);
      break;
    }
    case 'double-circle':
      // Radius equals half the center spacing so both circles remain touching
      // when the span control changes, rather than silently becoming linked.
      body = circle(-half, 0, half, first) + circle(half, 0, half, second, symbol.outline === 'line' ? second : outline);
      break;
    case 'cross': {
      const arms = resolveCrossArms(node, options.directions);
      const join = node.symbolCornerStyle === 'sharp' ? 'miter' : node.symbolCornerStyle === 'bevel' ? 'bevel' : 'round';
      const halfWidth = finite(node.symbolArmWidth, 10, 6, 24) / 2;
      body = `<path d="${crossSilhouette(arms, halfWidth)}" fill="${fill}" stroke="${outline}" stroke-width="3" stroke-linejoin="${join}" stroke-miterlimit="2"/>`;
      crossMetadata = ` data-cross-arm-count="${arms.length}" data-cross-angles="${arms.map(arm => number(arm.angle)).join(',')}"`;
      break;
    }
    case 'segmented-ring': {
      body = circle(0, 0, 12, fill, paper, 7);
      const count = Math.max(colors.length, 2), step = 360 / count, gap = Math.min(16, step / 4);
      body += Array.from({ length: count }, (_, index) => `<path d="${arc(12, index * step - 90 + gap / 2, (index + 1) * step - 90 - gap / 2)}" fill="none" stroke="${symbol.outline==='custom'?outline:colors[index % colors.length]}" stroke-width="5" stroke-linecap="butt"/>`).join('');
      break;
    }
    case 'orbital': {
      body = circle(0, 0, 14, fill, paper, 8) + circle(0, 0, 14, 'none', outline, 3);
      const d = 14 / Math.SQRT2;
      body += circle(-d, d, 5.5, paper, outline, 2.5) + circle(d, -d, 5.5, paper, symbol.outline === 'line' ? second : outline, 2.5);
      break;
    }
  }
  return `<g class="station-symbol" data-symbol="${symbol.shape}"${crossMetadata} transform="translate(${number(x)} ${number(y)}) rotate(${number(symbol.angle)}) scale(${number(symbol.size)})" pointer-events="none">${body}</g>`;
}
