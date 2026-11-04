import { normalizeTextStyle, labelUsesDefaults } from './labels.js';
import { normalizeSymbol, normalizeSymbolColors, normalizeCrossArms } from './symbols.js';
import { normalizeDefaults, effectiveLine, lineUsesDefaults, crossUsesDefaults, CORNER_STYLES } from './styles.js';

const modelPalette = ['#4068E8', '#E89A38', '#469B79', '#A67DB8', '#DC6A68', '#43A7B3', '#D381A9', '#7A8C49'];

/** Accept older version-1 maps while normalizing appearance controls. */
export function validateMap(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.nodes) || !Array.isArray(input.lines)) {
    throw new Error('Choose a Pointwise JSON map.');
  }
  if (input.nodes.length > 3000 || input.lines.length > 150) {
    throw new Error('This map is too large (maximum 3,000 points and 150 lines).');
  }
  const defaults = normalizeDefaults(input.defaults);
  const cornerIds = CORNER_STYLES.map(style => style.id);

  const seen = new Set();
  const nodes = input.nodes.map(node => {
    if (!node || typeof node.id !== 'string' || seen.has(node.id)
      || !Number.isFinite(node.x) || !Number.isFinite(node.y)
      || Math.abs(node.x) > 100000 || Math.abs(node.y) > 100000) {
      throw new Error('The map contains invalid station data.');
    }
    seen.add(node.id);
    const symbol = normalizeSymbol(node), paints=normalizeSymbolColors(node);
    return {
      id: node.id,
      x: node.x,
      y: node.y,
      name: String(node.name || 'Untitled stop').slice(0, 100),
      description: String(node.description || '').slice(0, 10000),
      url: String(node.url || '').slice(0, 2000),
      kind: node.kind === 'bend' ? 'bend' : 'station',
      labelPosition: ['top', 'right', 'bottom', 'left'].includes(node.labelPosition) ? node.labelPosition : 'top',
      ...normalizeTextStyle(node),
      labelStyleMode:labelUsesDefaults(node)?'global':'custom',
      labelOffsetX:Number.isFinite(node.labelOffsetX)?Math.max(-2000,Math.min(2000,node.labelOffsetX)):0,
      labelOffsetY:Number.isFinite(node.labelOffsetY)?Math.max(-2000,Math.min(2000,node.labelOffsetY)):0,
      symbol: symbol.shape,
      symbolAngle: symbol.angle,
      symbolSize: symbol.size,
      symbolLength: symbol.length,
      symbolOutline: symbol.outline,
      symbolFill: symbol.fill,
      symbolOutlineColor:paints.outlineColor,
      symbolFillColor:paints.fillColor,
      symbolCrossMode: node.symbolCrossMode === 'manual' ? 'manual' : 'auto',
      symbolCrossArms: normalizeCrossArms(node.symbolCrossArms),
      crossStyleMode: crossUsesDefaults({ defaults }, node) ? 'global' : 'custom',
      symbolCornerStyle: ['inherit', ...cornerIds].includes(node.symbolCornerStyle) ? node.symbolCornerStyle : 'inherit',
      symbolArmWidth: Number.isFinite(node.symbolArmWidth) ? Math.max(6, Math.min(24, node.symbolArmWidth)) : 10,
    };
  });

  const lineIds = new Set();
  const lines = input.lines.map((line, index) => {
    if (!line || typeof line.id !== 'string' || lineIds.has(line.id)
      || !Array.isArray(line.nodeIds) || line.nodeIds.some(id => !seen.has(id))) {
      throw new Error('The map contains invalid line connections.');
    }
    lineIds.add(line.id);
    const visual = effectiveLine({ defaults }, { ...line, styleMode: 'custom' });
    return {
      id: line.id,
      name: String(line.name || 'Untitled line').slice(0, 100),
      code: String(line.code || index + 1).slice(0, 5),
      color: /^#[0-9a-fA-F]{6}$/.test(line.color) ? line.color : modelPalette[index % modelPalette.length],
      width: visual.width,
      cornerRadius: visual.cornerRadius,
      cornerStyle: visual.cornerStyle,
      routing: visual.routing,
      style: visual.style,
      styleMode: lineUsesDefaults({ defaults }, line) ? 'global' : 'custom',
      nodeIds: [...line.nodeIds],
      visible: line.visible !== false,
    };
  });

  return {
    version: 1,
    title: String(input.title || 'Untitled map').slice(0, 100),
    subtitle: String(input.subtitle || '').slice(0, 200),
    theme: ['paper', 'night', 'mono'].includes(input.theme) ? input.theme : 'paper',
    defaults,
    nodes,
    lines,
  };
}
