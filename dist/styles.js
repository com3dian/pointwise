import { normalizeSymbolColors } from './symbols.js';
import { TEXT_DEFAULTS, normalizeTextStyle } from './labels.js';
/** Map-wide style defaults and explicit local overrides. No DOM dependencies. */
export const LINE_STYLES = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'double', label: 'Double track' },
  { id: 'triple', label: 'Triple track' },
  { id: 'outlined', label: 'Outlined' },
];

export const CORNER_STYLES = [
  { id: 'sharp', label: 'Sharp' },
  { id: 'rounded', label: 'Soft curve' },
  { id: 'circular', label: 'Circular' },
  { id: 'bevel', label: 'Beveled' },
];

export const DEFAULT_STYLES = Object.freeze({
  ...TEXT_DEFAULTS,
  cornerStyle: 'rounded',
  cornerRadius: 20,
  routing: 'octilinear',
  style: 'solid',
  width: 6,
  crossSize: 1,
  crossLength: 28,
  crossOutline: 'ink',
  crossFill: 'paper',
  crossCornerStyle: 'inherit',
  crossWidth: 10,
  crossOutlineColor:'#344038',
  crossFillColor:'#ffffff',
});

const cornerIds = CORNER_STYLES.map(style => style.id);
const lineIds = LINE_STYLES.map(style => style.id);
const finite = (value, fallback, min, max) => Number.isFinite(value)
  ? Math.max(min, Math.min(max, value)) : fallback;
const choice = (value, choices, fallback) => choices.includes(value) ? value : fallback;
const record = input => input && typeof input === 'object' ? input : {};

/** Normalize only supported map settings; callers receive an independent object. */
export function normalizeDefaults(input) {
  const value = record(input);
  const colors=normalizeSymbolColors({symbolOutlineColor:value.crossOutlineColor,symbolFillColor:value.crossFillColor});
  return {
    ...normalizeTextStyle(value),
    cornerStyle: choice(value.cornerStyle, cornerIds, DEFAULT_STYLES.cornerStyle),
    cornerRadius: finite(value.cornerRadius, DEFAULT_STYLES.cornerRadius, 0, 160),
    routing: choice(value.routing, ['octilinear', 'orthogonal'], DEFAULT_STYLES.routing),
    style: choice(value.style, lineIds, DEFAULT_STYLES.style),
    width: finite(value.width, DEFAULT_STYLES.width, 4, 24),
    crossSize: finite(value.crossSize, DEFAULT_STYLES.crossSize, .6, 3),
    crossLength: finite(value.crossLength, DEFAULT_STYLES.crossLength, 12, 60),
    crossOutlineColor:colors.outlineColor,
    crossFillColor:colors.fillColor,
    crossOutline: choice(value.crossOutline, ['ink', 'line','custom'], DEFAULT_STYLES.crossOutline),
    crossFill: choice(value.crossFill, ['paper', 'transparent','custom'], DEFAULT_STYLES.crossFill),
    crossCornerStyle: choice(value.crossCornerStyle, ['inherit', ...cornerIds], DEFAULT_STYLES.crossCornerStyle),
    crossWidth: finite(value.crossWidth, DEFAULT_STYLES.crossWidth, 6, 24),
  };
}

function ownLineStyle(line) {
  const value = record(line);
  return {
    cornerStyle: choice(value.cornerStyle, cornerIds, DEFAULT_STYLES.cornerStyle),
    cornerRadius: finite(value.cornerRadius, DEFAULT_STYLES.cornerRadius, 0, 160),
    routing: choice(value.routing, ['octilinear', 'orthogonal'], DEFAULT_STYLES.routing),
    style: choice(value.style, lineIds, DEFAULT_STYLES.style),
    width: finite(value.width, DEFAULT_STYLES.width, 4, 24),
  };
}

function ownCrossStyle(node) {
  const value = record(node), colors=normalizeSymbolColors(value);
  return {
    symbolSize: finite(value.symbolSize, DEFAULT_STYLES.crossSize, .6, 3),
    symbolLength: finite(value.symbolLength, DEFAULT_STYLES.crossLength, 12, 60),
    symbolOutlineColor:colors.outlineColor,
    symbolFillColor:colors.fillColor,
    symbolOutline: choice(value.symbolOutline, ['ink', 'line','custom'], DEFAULT_STYLES.crossOutline),
    symbolFill: choice(value.symbolFill, ['paper', 'transparent','custom'], DEFAULT_STYLES.crossFill),
    symbolCornerStyle: choice(value.symbolCornerStyle, ['inherit', ...cornerIds], 'inherit'),
    symbolArmWidth: finite(value.symbolArmWidth, DEFAULT_STYLES.crossWidth, 6, 24),
  };
}

function mapCrossStyle(defaults) {
  return {
    symbolSize: defaults.crossSize,
    symbolLength: defaults.crossLength,
    symbolOutline: defaults.crossOutline,
    symbolOutlineColor:defaults.crossOutlineColor,
    symbolFillColor:defaults.crossFillColor,
    symbolFill: defaults.crossFill,
    symbolCornerStyle: defaults.crossCornerStyle === 'inherit' ? defaults.cornerStyle : defaults.crossCornerStyle,
    symbolArmWidth: defaults.crossWidth,
  };
}

/** Legacy lines matching the old baseline join the global style automatically. */
export function lineUsesDefaults(map, line) {
  if (line?.styleMode === 'global') return true;
  if (line?.styleMode === 'custom') return false;
  const defaults = normalizeDefaults(map?.defaults);
  return Object.entries(ownLineStyle(line)).every(([key, value]) => value === defaults[key] || (key === 'width' && !map?.defaults && value === 8));
}

/** Cross appearance inherits independently of each stop's rotation and arms. */
export function crossUsesDefaults(map, node) {
  if (node?.crossStyleMode === 'global') return true;
  if (node?.crossStyleMode === 'custom') return false;
  const defaults = normalizeDefaults(map?.defaults);
  const own = ownCrossStyle(node);
  if (own.symbolCornerStyle === 'inherit') own.symbolCornerStyle = defaults.cornerStyle;
  const shared = mapCrossStyle(defaults);
  return Object.entries(own).every(([key, value]) => (key==='symbolOutlineColor'&&own.symbolOutline!=='custom')||(key==='symbolFillColor'&&own.symbolFill!=='custom')||value === shared[key]);
}

/** Resolve visual settings while preserving this route's topology and identity. */
export function effectiveLine(map, line) {
  const value = record(line), inherited = lineUsesDefaults(map, value);
  const defaults = normalizeDefaults(map?.defaults);
  const style = inherited ? {
    cornerStyle: defaults.cornerStyle,
    cornerRadius: defaults.cornerRadius,
    routing: defaults.routing,
    style: defaults.style,
    width: defaults.width,
  } : ownLineStyle(value);
  return { ...value, ...style, styleMode: inherited ? 'global' : 'custom' };
}

/** Only cross glyphs inherit cross styles; all local geometry remains untouched. */
export function effectiveNode(map, node) {
  const value = record(node);
  if (value.symbol !== 'cross') return { ...value };
  const inherited = crossUsesDefaults(map, value), defaults = normalizeDefaults(map?.defaults);
  const style = inherited ? mapCrossStyle(defaults) : ownCrossStyle(value);
  if (style.symbolCornerStyle === 'inherit') style.symbolCornerStyle = defaults.cornerStyle;
  return { ...value, ...style, crossStyleMode: inherited ? 'global' : 'custom' };
}
