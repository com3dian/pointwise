import { effectiveLabel, labelFont, labelLayout, labelCapsuleBounds } from './labels.js';
import { routePoints, roundedPath } from './geometry.js';
import { renderStationSymbol, symbolExtent } from './symbols.js';
import { stationDirections } from './topology.js';
import { effectiveLine, effectiveNode } from './styles.js';
import { renderLineStroke, lineStrokeExtent } from './strokes.js';

const xml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[character]));
const number = (value) => String(Number(value.toFixed(3)));
const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const routeColor = (line) => /^#[0-9a-f]{6}$/i.test(line.color) ? line.color : '#4068E8';
const lineWidth = (line) => Number.isFinite(line.width) ? Math.max(1, Math.min(24, line.width)) : 8;
const cornerRadius = (line) => Number.isFinite(line.cornerRadius) ? Math.max(0, Math.min(160, line.cornerRadius)) : 20;

let measuringContext;
function textWidth(text, size, weight = 500, family = 'sans') {
  // Real browser metrics keep the exported drawing compact. The fallback is
  // deliberately generous so headless exports cannot crop wide characters.
  if (measuringContext === undefined) {
    try { measuringContext = globalThis.document?.createElement('canvas').getContext('2d') || null; }
    catch { measuringContext = null; }
  }
  if (measuringContext) {
    measuringContext.font = `${weight} ${size}px ${labelFont(family)}`;
    const measured = measuringContext.measureText(String(text));
    return Math.max(measured.width, (measured.actualBoundingBoxLeft || 0) + (measured.actualBoundingBoxRight || 0)) + size * 0.5;
  }
  if(family==='mono')return [...String(text)].length*size*.65+size*.5;
  return [...String(text)].reduce((width, character) => {
    const ratio = /[MW@#%&]/.test(character) ? 1.05
      : /[ilIjtfr.,:;'!| ]/.test(character) ? 0.45
        : /[A-Z0-9]/.test(character) ? 0.85
          : /[a-z]/.test(character) ? 0.75 : 1.2;
    return width + size * ratio;
  }, size * 0.5);
}

function labelCorners(node, position, size) {
  const width = textWidth(node.name || '', size,node.labelWeight,node.labelFontFamily);
  const left = position.x - (position.anchor === 'middle' ? width / 2 : position.anchor === 'end' ? width : 0);
  let corners = [
    { x: left - 4, y: position.y - size - 4 },
    { x: left + width + 4, y: position.y - size - 4 },
    { x: left - 4, y: position.y + size * 0.4 + 4 },
    { x: left + width + 4, y: position.y + size * 0.4 + 4 },
  ];
  if(node.labelShape==='capsule') {
    const box=labelCapsuleBounds(node,position),edge=node.labelBorderWidth/2+4;
    corners=[{x:box.x-edge,y:box.y-edge},{x:box.x+box.width+edge,y:box.y-edge},{x:box.x-edge,y:box.y+box.height+edge},{x:box.x+box.width+edge,y:box.y+box.height+edge}];
  }
  if (!node.labelAngle) return corners;
  const angle = node.labelAngle*Math.PI / 180;
  return corners.map((point) => {
    const dx = point.x - position.x;
    const dy = point.y - position.y;
    return {
      x: position.x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: position.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  });
}

/** Create a self-contained, unclipped vector drawing, without editor UI. */
export function buildSVG(map) {
  const sourceNodes = (map.nodes || []).filter(finitePoint).map(node => effectiveLabel(map,effectiveNode(map, node)));
  const nodesById = new Map(sourceNodes.map((node) => [node.id, node]));
  const allLines = (map.lines || []).map(line => effectiveLine(map, line));
  const lines = allLines.filter((line) => line.visible !== false);
  const memberships = new Map(sourceNodes.map((node) => [node.id, []]));
  const anyMembership = new Set();
  allLines.forEach((line) => (line.nodeIds || []).forEach((id) => anyMembership.add(id)));
  lines.forEach((line) => new Set(line.nodeIds || []).forEach((id) => memberships.get(id)?.push(line)));
  const nodes = sourceNodes.filter((node) => !anyMembership.has(node.id) || memberships.get(node.id).length);
  const directionsById = new Map(nodes.filter(node => node.symbol === 'cross').map(node => [node.id, stationDirections(map, node.id)]));
  const directionsFor = node => directionsById.get(node.id) || [];
  const night = map.theme === 'night';
  const mono = map.theme === 'mono';
  const background = night ? '#1e2925' : mono ? '#fbfaf6' : '#f8f9f5';
  const ink = night ? '#e3eadc' : '#344038';
  const color = (line) => mono ? ink : routeColor(line);
  const margin = 48;
  const extents = [];

  nodes.forEach((node) => {
    const interchange = memberships.get(node.id).length > 1;
    const directions = directionsFor(node);
    const radius = node.kind === 'bend' ? 14 : symbolExtent(node, interchange, directions);
    extents.push({ x: node.x - radius, y: node.y - radius }, { x: node.x + radius, y: node.y + radius });
    if (node.kind !== 'bend') extents.push(...labelCorners(node, labelLayout(node, interchange, directions), node.labelFontSize));
  });
  // Strokes can extend beyond station centers, especially wide outlined
  // routes and sharp miter corners. Include every routed elbow in the frame.
  lines.forEach(line => {
    const points = (line.nodeIds || []).map(id => nodesById.get(id)).filter(Boolean);
    const radius = lineStrokeExtent(line);
    routePoints(points, line.routing).forEach(point => extents.push(
      {x:point.x-radius,y:point.y-radius}, {x:point.x+radius,y:point.y+radius},
    ));
  });
  const minX = extents.length ? Math.min(...extents.map((point) => point.x)) : 0;
  const maxX = extents.length ? Math.max(...extents.map((point) => point.x)) : 0;
  const minY = extents.length ? Math.min(...extents.map((point) => point.y)) : 0;
  const maxY = extents.length ? Math.max(...extents.map((point) => point.y)) : 0;
  const title = String(map.title || 'Untitled map');
  const subtitle = String(map.subtitle || '');
  const legends = lines.map((line) => {
    const text = `${line.code || ''} ${line.name || 'Untitled line'}`.trim();
    return { line, text, width: 36 + textWidth(text, 21, 500) + 28 };
  });
  const width = Math.ceil(Math.max(
    800,
    maxX - minX + margin * 2,
    textWidth(title, 48, 700) + margin * 2,
    textWidth(subtitle, 21, 400) + margin * 2,
    ...legends.map((legend) => legend.width + margin * 2),
  ));
  const headerHeight = subtitle ? 156 : 116;
  const bodyHeight = Math.max(300, maxY - minY);
  const offsetX = (width - (maxX - minX)) / 2 - minX;
  const offsetY = headerHeight + (bodyHeight - (maxY - minY)) / 2 - minY;
  let legendX = margin;
  let legendY = headerHeight + bodyHeight + 60;
  const legendMarkup = legends.map(({ line, text, width: itemWidth }) => {
    if (legendX > margin && legendX + itemWidth > width - margin) {
      legendX = margin;
      legendY += 48;
    }
    const item = `<g class="legend-item" transform="translate(${number(legendX)} ${number(legendY)})">${renderLineStroke('M0 0h24', {...line,width:5}, {color:color(line),paper:background})}<text x="36" y="7.5" font-family="Arial, sans-serif" font-size="21" fill="${ink}">${xml(text)}</text></g>`;
    legendX += itemWidth;
    return item;
  }).join('');
  const height = Math.ceil((legends.length ? legendY : headerHeight + bodyHeight) + margin);
  const routes = lines.map((line) => {
    const points = (line.nodeIds || []).map((id) => nodesById.get(id)).filter(Boolean);
    const anchors = points.filter(node => node.kind !== 'bend').map(node => ({ x: node.x, y: node.y, maxDeviation: memberships.get(node.id).length > 1 ? 0 : Math.min(3, lineWidth(line) / 2) }));
    const path = roundedPath(routePoints(points, line.routing), cornerRadius(line), anchors, line.cornerStyle);
    return renderLineStroke(path,line,{color:color(line),paper:background});
  }).join('');
  const stops = nodes.filter((node) => node.kind !== 'bend').map((node) => {
    const members = memberships.get(node.id);
    const interchange = members.length > 1;
    const directions = directionsFor(node);
    const position = labelLayout(node, interchange, directions);
    const symbol = renderStationSymbol(node, { colors: members.length ? members.map(color) : [mono ? ink : '#627953'], ink, paper: background, interchange, directions });
    const transform=node.labelAngle?` transform="rotate(${node.labelAngle} ${number(position.x)} ${number(position.y)})"`:'';
    const textColor=node.labelColor==='auto'?ink:node.labelColor;
    const box=labelCapsuleBounds(node,position),capsule=node.labelShape==='capsule';
    const badge=capsule?`<rect class="label-capsule" x="${number(box.x)}" y="${number(box.y)}" width="${number(box.width)}" height="${number(box.height)}" rx="${number(box.height/2)}" fill="${node.labelFillColor==='auto'?background:node.labelFillColor}" stroke="${node.labelBorderColor==='auto'?textColor:node.labelBorderColor}" stroke-width="${node.labelBorderWidth}"${transform}/>`:'';
    return `<g data-station-id="${xml(node.id)}">${symbol}${badge}<text x="${number(position.x)}" y="${number(position.y)}" text-anchor="${position.anchor}" font-family="${labelFont(node.labelFontFamily)}" font-size="${node.labelFontSize}" font-weight="${node.labelWeight}" fill="${textColor}" stroke="${capsule?'none':background}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"${transform}>${xml(node.name)}</text></g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><title>${xml(title)}</title><desc>${xml(subtitle)}</desc><rect width="${width}" height="${height}" fill="${background}"/><text x="${margin}" y="72" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="${ink}">${xml(title)}</text>${subtitle ? `<text x="${margin}" y="110" font-family="Arial, sans-serif" font-size="21" fill="${ink}" opacity=".7">${xml(subtitle)}</text>` : ''}<g class="map-content" transform="translate(${number(offsetX)} ${number(offsetY)})">${routes}${stops}</g>${legendMarkup}</svg>`;
}
