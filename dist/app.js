import { lineEndpoint, extensionAnchor, appendRouteStop } from './extension.js';
import { JSONFileAutosave, rememberProjectFile, recallProjectFile } from './project-file.js';
import { removeMapItem, repairEmptyRoutes } from './deletion.js';
import { normalizeTextStyle, labelUsesDefaults, effectiveLabel, labelFont, labelLayout, labelCapsuleBounds, moveLabelOffset } from './labels.js';
import { mapZoomShortcut } from './shortcuts.js';
import { renderDescription } from './markdown.js';
import { stationStoryPosition } from './presentation.js';
import { snapPoint, routePoints, roundedPath, nearestOnLine, getBounds } from './geometry.js';
import { templates } from './templates.js';
import { buildSVG } from './export.js';
import { SYMBOL_TYPES, normalizeSymbol, normalizeSymbolColors, renderStationSymbol, symbolExtent, normalizeCrossArms, resolveCrossArms } from './symbols.js';
import { stationDirections } from './topology.js';
import { validateMap } from './model.js';
import { DEFAULT_STYLES, LINE_STYLES, CORNER_STYLES, normalizeDefaults, effectiveLine, effectiveNode, lineUsesDefaults, crossUsesDefaults } from './styles.js';
import { renderLineStroke } from './strokes.js';
import { routeEditHandles, beginRoutePointEdit, moveRoutePoint } from './movement.js';
import { selectionItems, selectionKey, isSelected, toggleSelection, selectedRecords, batchStyleValue, applyBatchStyle } from './multiselect.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const id = prefix => `${prefix}-${crypto.randomUUID()}`;
const palette = ['#4068E8','#E89A38','#469B79','#A67DB8','#DC6A68','#43A7B3','#D381A9','#7A8C49'];
const colorPalette=[...palette,'#344038','#888888','#ffffff','#000000'];
let paletteTarget=null;
const icons = {
  plus:'<path d="M8 3v10M3 8h10"/>', minus:'<path d="M3 8h10"/>',
  cursor:'<path d="m4 2 9 8-5 1-2 5z"/>', route:'<path d="M3 13V9a3 3 0 0 1 3-3h4a3 3 0 0 0 3-3"/><circle cx="3" cy="13" r="2"/><circle cx="13" cy="3" r="2"/>',
  station:'<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="1.5"/>',
  hand:'<path d="M4.5 8V5a1 1 0 0 1 2 0V3a1 1 0 0 1 2 0v2a1 1 0 0 1 2 0v1a1 1 0 0 1 2 0v4c0 3-2 5-4 5H7c-2 0-3-1-4-3L1.5 9a1 1 0 0 1 1.5-1l1.5 1"/>',
  undo:'<path d="m6 3-4 4 4 4M2 7h7a4 4 0 0 1 0 8"/>', redo:'<path d="m10 3 4 4-4 4m4-4H7a4 4 0 0 0 0 8"/>',
  fit:'<path d="M6 2H2v4m8-4h4v4M2 10v4h4m8-4v4h-4M6 6h4v4H6z"/>',
  export:'<path d="M8 10V1m-3 3 3-3 3 3M3 7H1v7h14V7h-2"/>', play:'<path d="m5 2 9 6-9 6z"/>',
  eye:'<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"/><circle cx="8" cy="8" r="2"/>',
  close:'<path d="m4 4 8 8m0-8-8 8"/>', trash:'<path d="M2 4h12M6 4V2h4v2M4 4l1 10h6l1-10M7 7v4m2-4v4"/>',
  spark:'<path d="m8 1 2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
  file:'<path d="M3 1h6l4 4v10H3zM9 1v4h4M5 9h6m-6 3h4"/>',
  'panel-left':'<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M6 2v12"/>',
  'panel-right':'<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M10 2v12"/>',
  focus:'<path d="M6 2H2v4m8-4h4v4M2 10v4h4m8-4v4h-4"/>',
  sliders:'<path d="M2 4h3m4 0h5M2 12h7m4 0h1"/><circle cx="7" cy="4" r="2"/><circle cx="11" cy="12" r="2"/>',
  help:'<circle cx="8" cy="8" r="6"/><path d="M6 6a2 2 0 0 1 4 0c0 1-2 2-2 3m0 2v.1"/>',
};
const icon = name => `<svg viewBox="0 0 16 16" aria-hidden="true">${icons[name] || ''}</svg>`;
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon)); }
hydrateIcons();

const STORAGE = 'wayline.map.v1';
const UI_STORAGE = 'pointwise.workspace.v1';
const layoutQuery=window.matchMedia('(min-width: 901px)');
const wideLayout = () => layoutQuery.matches;
let panels = {left:wideLayout(),right:wideLayout(),restore:null};
try {
  const saved = JSON.parse(localStorage.getItem(UI_STORAGE));
  if(saved && typeof saved.left==='boolean' && typeof saved.right==='boolean') {
    panels.left=saved.left;panels.right=saved.right;
    if(saved.restore && typeof saved.restore.left==='boolean' && typeof saved.restore.right==='boolean') panels.restore=saved.restore;
  }
} catch { /* Workspace preferences are optional. */ }
let editingWorkspace=null;

let map, loadedSavedMap=false;
try { map = validateMap(JSON.parse(localStorage.getItem(STORAGE))); loadedSavedMap=true; } catch { map = validateMap(templates[0].create()); }
// Apply the slimmer stroke treatment once to the existing browser document.
try {
  if(!localStorage.getItem('pointwise.slim-strokes.v1')) {
    if(loadedSavedMap){
      map.defaults.width=Math.max(4,map.defaults.width*.75);
      map.lines.forEach(line=>line.width=Math.max(4,line.width*.75));
    }
    localStorage.setItem('pointwise.slim-strokes.v1','1');
  }
} catch { /* The editor also works without browser storage. */ }
let repairedSnapshot=null;
if(loadedSavedMap){const before=clone(map);if(repairEmptyRoutes(map))repairedSnapshot=before;}
let tool='select', selection=null, activeLineId=null, drawing=false, presenting=false;
let activeRoutePointId=null,drawingEnd='end';
let undoStack=repairedSnapshot?[repairedSnapshot]:[], redoStack=[], drag=null, spaceDown=false, suppressClick=false;
let lastCanvasDown=null;
let view={x:0,y:0,width:1200,height:900}, fitWidth=1200, animateFrame, toastTimer;
let showGrid=true, snapGrid=true;
const canvas=$('#map-canvas'), canvasArea=$('#canvas-area');
const getNode = nid => map.nodes.find(n => n.id===nid);
const getLine = lid => map.lines.find(l => l.id===lid);
const lineNodes = l => l.nodeIds.map(getNode).filter(Boolean);
const nodeLines = nid => map.lines.filter(l => l.nodeIds.includes(nid));
const visibleLines = () => map.lines.filter(l=>l.visible);
const visualLines = () => visibleLines().map(l=>effectiveLine(map,l));
const paperColor = () => map.theme==='night'?'#1e2925':map.theme==='mono'?'#fbfaf6':'#f8f9f5';
const lineVisualKeys = ['cornerStyle','cornerRadius','routing','style','width'];
const crossVisualKeys = ['symbolSize','symbolLength','symbolOutline','symbolFill','symbolOutlineColor','symbolFillColor','symbolCornerStyle','symbolArmWidth'];
function makeLineCustom(line){Object.assign(line,effectiveLine(map,line),{styleMode:'custom'});}
function makeCrossCustom(node){Object.assign(node,effectiveNode(map,node),{crossStyleMode:'custom'});}
const selectedNode = () => selection?.type==='node'?getNode(selection.id):null;
const selectedLine = () => selection?.type==='line'?getLine(selection.id):null;
const colorForNode = nid => nodeLines(nid).find(l=>l.visible)?.color || '#627953';

function notify(message) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('show'); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200); }
const nativeFileAccess=typeof window.showOpenFilePicker==='function'&&typeof window.showSaveFilePicker==='function';
let fileSessionRevision=0;
const projectAutosave=new JSONFileAutosave({getText:()=>JSON.stringify(map,null,2),onStatus:updateProjectFileStatus,onRecord:record=>{rememberProjectFile(record).catch(()=>{});}});
function save() {
  try { localStorage.setItem(STORAGE,JSON.stringify(map)); $('#saved-state').innerHTML='<i></i> Saved'; }
  catch { $('#saved-state').textContent='Storage full — export a backup'; }
  projectAutosave.queue();
}
function snapshot() { undoStack.push(clone(map)); if(undoStack.length>80)undoStack.shift(); redoStack=[]; }
function commit(change, {inspector=true}={}) { if(presenting)return; snapshot(); change(); save(); render(inspector); }
function history(direction) {
  if(presenting)return;
  if(drag)endDrag();
  const from=direction==='undo'?undoStack:redoStack, to=direction==='undo'?redoStack:undoStack;
  if (!from.length) return;
  to.push(clone(map)); map=from.pop(); activeRoutePointId=null; selection=null; drawing=false; activeLineId=null; setTool('select'); save(); render();
}
function syncPanels() {
  // Drawers share the canvas on smaller screens; keep one open at a time.
  if(!wideLayout()&&panels.left&&panels.right)panels.left=false;
  document.body.classList.toggle('panels-left-hidden',!panels.left);
  document.body.classList.toggle('panels-right-hidden',!panels.right);
  $('#lines-panel').inert=!panels.left||presenting;
  $('#inspector').inert=!panels.right||presenting;
  for(const [side,button,label] of [['left',$('#network-toggle'),'lines'],['right',$('#properties-toggle'),'properties']]) {
    button.setAttribute('aria-expanded',String(panels[side]));
    button.setAttribute('aria-label',`${panels[side]?'Hide':'Show'} ${label} panel`);
  }
  renderEndpointActions();
  $('#focus-toggle').setAttribute('aria-pressed',String(presenting));
  $('#focus-toggle').setAttribute('aria-label',presenting?'Exit presentation':'Present fullscreen');
  if(!presenting)try{localStorage.setItem(UI_STORAGE,JSON.stringify(panels));}catch{}
}
function togglePanel(side) {
  if(presenting)return;
  panels[side]=!panels[side];panels.restore=null;
  if(!wideLayout()&&panels[side])panels[side==='left'?'right':'left']=false;
  syncPanels();
}
async function toggleFocus() {
  if(presenting){await exitPresentation();return;}
  setPresent(true);
  try {
    if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen();
    if(!presenting&&document.fullscreenElement)await document.exitFullscreen();
  } catch {
    notify('Presentation opened. Fullscreen is unavailable in this browser.');
  }
}
async function exitPresentation() {
  if(document.fullscreenElement) {
    try { await document.exitFullscreen(); }
    catch { notify('Press Esc to leave fullscreen.');return; }
  }
  setPresent(false);
}
document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement&&presenting)setPresent(false);
  else if(presenting)requestAnimationFrame(()=>fitMap(false));
});
function setSelection(type, nid, pointId=null, additive=false) {
  closeColorPalette();
  activeRoutePointId=pointId;
  if(presenting&&type!=='node')type=null;
  selection=type?(additive&&!presenting?toggleSelection(selection,{type,id:nid}):{type,id:nid}):null;
  if(type==='line')activeLineId=nid;
  if(!presenting&&type&&!wideLayout()&&panels.left){panels.left=false;panels.right=true;syncPanels();}
  render();
  if(presenting&&selectedNode())$('#station-story').focus({preventScroll:true});
}
function render(inspector=true) {
  $('#document-name').textContent=map.title;
  document.title=`${map.title} — Pointwise`;
  $('#map-title').textContent=map.title; $('#map-subtitle').textContent=map.subtitle;
  canvasArea.classList.toggle('night',map.theme==='night'); canvasArea.classList.toggle('mono',map.theme==='mono');
  $('#grid-layer').style.display=showGrid&&!presenting?'':'none';
  $$('[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===map.theme));
  $('#undo').disabled=!undoStack.length; $('#redo').disabled=!redoStack.length;
  renderLines(); renderMap(); if(inspector) renderInspector(); updateHint(); refreshGlobalPreview();
}
function renderLines() {
  $('#line-list').innerHTML=map.lines.map(l=>`<div class="line-row ${isSelected(selection,'line',l.id)?'selected':''} ${!l.visible?'hidden-line':''}" data-select-line="${esc(l.id)}" role="button" tabindex="0" aria-pressed="${isSelected(selection,'line',l.id)}" aria-label="Edit ${esc(l.name)} line"><span class="line-code" style="--line-color:${l.color}">${esc(l.code)}</span><span class="line-info"><span class="line-name">${esc(l.name)}</span><span class="line-stats">${lineNodes(l).filter(n=>n.kind!=='bend').length} stops</span></span><button class="line-eye" data-toggle-line="${esc(l.id)}" aria-label="${l.visible?'Hide':'Show'} ${esc(l.name)}" title="${l.visible?'Hide':'Show'} line">${icon('eye')}</button></div>`).join('');
  $('#map-legend').innerHTML=visualLines().map(l=>`<span class="legend-item"><svg viewBox="0 0 26 12" aria-hidden="true">${renderLineStroke('M2 6H24',{...l,width:4},{color:map.theme==='night'?'#aaaaaa':'#888888',paper:paperColor()})}</svg>${esc(l.code)} &nbsp;${esc(l.name)}</span>`).join('');
}
function linePath(line) {
  line=effectiveLine(map,line);
  const nodes=lineNodes(line);
  const anchors=nodes.filter(n=>n.kind!=='bend').map(n=>({x:n.x,y:n.y,maxDeviation:nodeLines(n.id).filter(l=>l.visible).length>1?0:Math.min(3,line.width/2)}));
  return roundedPath(routePoints(nodes,line.routing),line.cornerRadius,anchors,line.cornerStyle);
}
function renderRouteHandles() {
  const layer=$('#route-edit-layer'),line=selectedLine();
  if(!layer)return;
  if(presenting||tool!=='select'||!line){layer.innerHTML='';return;}
  const scale=view.width/Math.max(1,canvas.clientWidth),radius=4.5*scale,hit=11*scale;
  const stations=map.nodes.filter(n=>n.kind!=='bend');
  layer.innerHTML=routeEditHandles(map,line.id,effectiveLine(map,line).routing).filter(handle=>handle.kind==='bend'||!stations.some(n=>Math.hypot(n.x-handle.x,n.y-handle.y)<hit+6*scale)).map(handle=>{
    const active=handle.id&&handle.id===activeRoutePointId,existing=handle.kind==='bend';
    const label=existing?'Route bend':handle.kind==='corner'?'Corner handle':'Add bend on segment';
    return `<g class="route-edit-handle ${existing?'existing':'virtual'} ${active?'active':''}" data-route-handle="${handle.kind}" data-route-line="${esc(line.id)}" data-route-node="${esc(handle.id||'')}" data-insert-index="${handle.insertIndex}" data-x="${handle.x}" data-y="${handle.y}" tabindex="0" role="button" aria-label="${label} on ${esc(line.name)}"><title>${existing?'Drag to reshape · Double-click or Delete to remove':'Drag to create a bend · Stops stay fixed'}</title><circle class="route-handle-hit" cx="${handle.x}" cy="${handle.y}" r="${hit}"/><rect class="route-handle-diamond" x="${handle.x-radius}" y="${handle.y-radius}" width="${radius*2}" height="${radius*2}" rx="${scale}" transform="rotate(45 ${handle.x} ${handle.y})" style="--handle-color:${line.color}"/>${!existing?`<path class="route-handle-plus" d="M${handle.x-radius/2} ${handle.y}H${handle.x+radius/2}M${handle.x} ${handle.y-radius/2}V${handle.y+radius/2}"/>`:''}</g>`;
  }).join('');
}
function readRouteHandle(el) {
  return {lineId:el.dataset.routeLine,nodeId:el.dataset.routeNode||null,insertIndex:Number(el.dataset.insertIndex),x:Number(el.dataset.x),y:Number(el.dataset.y)};
}
function startRoutePointDrag(event,point,lineId,handle=null,doubleAction=null) {
  const line=getLine(lineId);if(!line)return;
  drag={type:'route-point',id:lineId,nodeId:handle?.nodeId||null,insertIndex:handle?handle.insertIndex:null,anchor:handle?{x:handle.x,y:handle.y}:{x:point.x,y:point.y},point,clientX:event.clientX,clientY:event.clientY,moved:false,changed:false,edit:null,doubleAction,before:clone(map)};
  canvas.setPointerCapture(event.pointerId);
}
function cancelRoutePointDrag(event) {
  if(drag?.type!=='route-point')return;
  map=drag.before;activeRoutePointId=drag.nodeId;drag=null;canvas.classList.remove('editing-route');render();
  if(event&&canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
}
function removeActiveRoutePoint() {
  const line=selectedLine(),node=getNode(activeRoutePointId);
  if(!line||!node||node.kind!=='bend'||!line.nodeIds.includes(node.id))return false;
  commit(()=>{line.nodeIds=line.nodeIds.filter(nid=>nid!==node.id);if(!nodeLines(node.id).length)map.nodes=map.nodes.filter(n=>n.id!==node.id);activeRoutePointId=null;});
  return true;
}
function renderMap() {
  $('#route-layer').innerHTML=visualLines().map(l=>{
    const d=linePath(l), selected=isSelected(selection,'line',l.id);
    const dim=presenting&&selection?.type==='line'&&!selected;
    return `<g class="line-group" data-line="${esc(l.id)}" opacity="${dim ? 0.25 : 1}">${selected?`<path class="route-selection" style="stroke-width:${l.width+10}" d="${d}" stroke="${l.color}"/>`:''}${renderLineStroke(d,l,{color:map.theme==='mono'?'#30382e':l.color,paper:paperColor()})}<path class="route-hit" data-line-id="${esc(l.id)}" d="${d}"/></g>`;
  }).join('');
  $('#station-layer').innerHTML=map.nodes.map(raw=>{
    const n=effectiveLabel(map,effectiveNode(map,raw));
    const all=nodeLines(n.id), member=all.filter(l=>l.visible);
    if(all.length && !member.length)return '';
    const selected=isSelected(selection,'node',n.id);
    if(n.kind==='bend')return !presenting&&selected?`<g data-node-id="${esc(n.id)}"><circle class="station-hit" cx="${n.x}" cy="${n.y}" r="15"/><rect class="bend-handle" x="${n.x-4}" y="${n.y-4}" width="8" height="8" stroke="${colorForNode(n.id)}"/></g>`:'';
    const interchange=member.length>1, color=colorForNode(n.id);
    const directions=n.symbol==='cross'?stationDirections(map,n.id):[];
    const extent=symbolExtent(n,interchange,directions);
    const symbol=renderStationSymbol(n,{directions,colors:member.length?member.map(l=>map.theme==='mono'?'#30382e':l.color):['#627953'],interchange,ink:map.theme==='night'?'#e3eadc':'#344038',paper:map.theme==='night'?'#1e2925':map.theme==='mono'?'#fbfaf6':'#f8f9f5'});
    const {x,y,anchor}=labelCoordinates(n);
    const transform=n.labelAngle?`transform="rotate(${n.labelAngle} ${x} ${y})"`:'';
    const textColor=n.labelColor==='auto'?'var(--label)':n.labelColor;
    const box=labelCapsuleBounds(n,{x,y,anchor}),capsule=n.labelShape==='capsule';
    const badge=capsule?`<rect class="station-label-capsule" data-label-capsule="${esc(n.id)}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${box.height/2}" fill="${n.labelFillColor==='auto'?paperColor():n.labelFillColor}" stroke="${n.labelBorderColor==='auto'?textColor:n.labelBorderColor}" stroke-width="${n.labelBorderWidth}" ${transform}/>`:'';
    return `<g class="station-group ${selected?'selected':''}" data-node-id="${esc(n.id)}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${esc(n.name)}, ${member.length>1?'interchange, ':''}${esc(member.map(l=>l.name).join(', '))}"><circle class="station-hit" cx="${n.x}" cy="${n.y}" r="${Math.max(17,extent+5)}"/>${selected?`<circle class="station-ring" cx="${n.x}" cy="${n.y}" r="${extent+6}" stroke="${color}"/>`:''}${symbol}${badge}<text class="station-label" data-label-node="${esc(n.id)}" tabindex="0" aria-label="Move name: ${esc(n.name)}" style="font-size:${n.labelFontSize}px;font-family:${labelFont(n.labelFontFamily)};font-weight:${n.labelWeight};fill:${textColor};${capsule?'stroke:none;':''}" x="${x}" y="${y}" text-anchor="${anchor}" ${transform}>${esc(n.name)}</text></g>`;
  }).join('');
  renderRouteHandles();renderEndpointActions();renderStationStory();
}
function labelCoordinates(n) {
  n=effectiveNode(map,n);
  n=effectiveLabel(map,n);
  return labelLayout(n,nodeLines(n.id).filter(l=>l.visible).length>1,n.symbol==='cross'?stationDirections(map,n.id):[]);
}

function formatControlValue(key,value) {
  if(key==='symbolAngle')return `${value}°`;
  if(key==='symbolSize'||key==='crossSize')return `${Number(value).toFixed(1)}×`;
  return String(value);
}
function rangeControl({key,label,value,min,max,step=1,node=true,disabled=false,precise=false,globalField=false}) {
  const controlId=`control-${globalField?'default-':''}${key}`;
  const field=`data-${globalField?'default':node?'node':'line'}-field="${key}"`;
  const valueControl=precise?`<span class="precise-value"><input type="number" aria-label="${label} angle" min="${min}" max="${max}" step="${step}" value="${value}" ${disabled?'disabled':''} ${field}><span>°</span></span>`:`<output for="${controlId}" data-value-for="${key}">${formatControlValue(key,value)}</output>`;
  return `<div class="range-field ${disabled?'control-disabled':''}"><div class="range-label"><label for="${controlId}">${label}</label>${valueControl}</div><input id="${controlId}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${disabled?'disabled':''} ${field}></div>`;
}
function crossControls(n) {
  if(n.symbol!=='cross')return '';
  const automatic=n.symbolCrossMode!=='manual', arms=automatic?resolveCrossArms(n,stationDirections(map,n.id)):normalizeCrossArms(n.symbolCrossArms);
  return `<div class="cross-controls"><div class="field"><label for="cross-mode">Cross arms</label><select id="cross-mode" data-node-field="symbolCrossMode"><option value="auto" ${automatic?'selected':''}>Follow connected lines</option><option value="manual" ${!automatic?'selected':''}>Adjust arms individually</option></select></div>${automatic?`<div class="cross-direction-chips" aria-label="Detected line directions">${arms.map(arm=>`<span>${Math.round(arm.angle)}°</span>`).join('')}</div><p class="control-help">Each arm follows a route entering this stop. Adjust the overall rotation above, or customize individual arms.</p><button class="button outlined full-width" data-action="customize-cross">Adjust these arms</button>`:`<div class="cross-arms"><div class="cross-arms-heading"><span>Arm</span><span>Angle °</span><span>Length</span><span></span></div>${arms.map((arm,i)=>`<div class="cross-arm-row"><span class="cross-arm-number">${i+1}</span><input type="number" aria-label="Arm ${i+1} angle" data-cross-index="${i}" data-cross-field="angle" min="-180" max="180" step="any" value="${arm.angle}"><input type="number" aria-label="Arm ${i+1} length" data-cross-index="${i}" data-cross-field="length" min="6" max="60" step="1" value="${arm.length}"><button class="icon-button" data-remove-arm="${i}" title="Remove arm ${i+1}" aria-label="Remove arm ${i+1}" ${arms.length<=2?'disabled':''}>${icon('close')}</button></div>`).join('')}</div><div class="cross-arm-actions"><button class="button outlined" data-action="add-cross-arm" ${arms.length>=8?'disabled':''}>${icon('plus')} Add arm</button><button class="text-button" data-action="follow-cross">Match lines again</button></div><p class="control-help">Angles are measured before the overall rotation. Change each arm’s angle and length to fit the crossing.</p>`}</div>`;
}
function automaticLabelColor(key,style={}) {
  return key==='labelFillColor'?paperColor():key==='labelBorderColor'&&style.labelColor&&style.labelColor!=='auto'?style.labelColor:map.theme==='night'?'#e3eadc':'#344038';
}
function colorControl(label,key,value,scope='node',reset=false,autoColor=automaticLabelColor(key)) {
  const automatic=value==='auto',hex=automatic?autoColor:value;
  const id=`${scope}-${key}`;
  return `<div class="field color-field"><label for="${id}">${label}</label><div class="paint-controls"><button type="button" id="${id}-picker" class="paint-palette-trigger" data-palette-scope="${scope}" data-palette-field="${key}" data-paint-preview="${id}" style="--paint-color:${hex}" aria-label="${label} palette" aria-expanded="false" title="Choose ${label.toLowerCase()}"><span class="paint-chip"></span></button><input class="input" id="${id}" data-${scope}-field="${key}" value="${hex}" maxlength="7" pattern="#[0-9a-fA-F]{6}" aria-label="${label} hex">${reset?`<button class="color-reset ${automatic?'active':''}" data-reset-text-color="${scope}" data-reset-label-color="${key}" aria-label="Use automatic ${label.toLowerCase()}" aria-pressed="${automatic}">Auto</button>`:''}</div></div>`;
}
function closeColorPalette(){
  const popover=$('#color-popover');if(!popover)return;
  if(typeof popover.hidePopover==='function'&&popover.matches(':popover-open'))popover.hidePopover();
  popover.hidden=true;delete popover.dataset.open;paletteTarget=null;
  $$('[data-palette-field]').forEach(button=>button.setAttribute('aria-expanded','false'));
}
function openColorPalette(button){
  const scope=button.dataset.paletteScope,key=button.dataset.paletteField;
  const same=paletteTarget?.scope===scope&&paletteTarget?.key===key;
  closeColorPalette();if(same)return;
  const input=$(`#${scope}-${key}`);if(!input)return;
  paletteTarget={scope,key,id:scope==='node'?selectedNode()?.id:scope==='line'?selectedLine()?.id:null};
  const color=/^#[0-9a-f]{6}$/i.test(input.value)?input.value:'#344038',popover=$('#color-popover');
  paletteTarget.selectionKey=selectionKey(selection);
  (button.closest('dialog')||document.body).appendChild(popover);
  popover.innerHTML=`<div class="color-popover-heading">Colors</div><div class="shared-palette" role="group" aria-label="Shared metro palette">${colorPalette.map(hex=>`<button type="button" class="palette-swatch" data-palette-color="${hex}" style="--swatch:${hex}" aria-label="Set color ${hex}" aria-pressed="${hex.toLowerCase()===color.toLowerCase()}"></button>`).join('')}</div><label class="palette-custom">Custom color<input type="color" data-palette-custom value="${color}" aria-label="Custom color"></label>`;
  popover.hidden=false;popover.dataset.open='true';
  if(typeof popover.showPopover==='function')popover.showPopover();
  const anchor=button.getBoundingClientRect(),bounds=popover.getBoundingClientRect();
  const inspector=button.closest('#inspector')?.getBoundingClientRect();
  const beside=inspector&&inspector.left>bounds.width+20;
  popover.style.left=`${beside?inspector.left-bounds.width-10:Math.max(8,Math.min(anchor.left,window.innerWidth-bounds.width-8))}px`;
  popover.style.top=`${beside?Math.max(8,Math.min(anchor.top,window.innerHeight-bounds.height-8)):Math.max(8,anchor.bottom+bounds.height+8>window.innerHeight?anchor.top-bounds.height-6:anchor.bottom+6)}px`;
  button.setAttribute('aria-expanded','true');
}
function choosePaletteColor(color,close=true){
  const target=paletteTarget;if(!target||!/^#[0-9a-f]{6}$/i.test(color))return;
  if(target.scope.startsWith('batch-')&&target.selectionKey!==selectionKey(selection)){closeColorPalette();return;}
  if(target.scope==='node'&&selectedNode()?.id!==target.id||target.scope==='line'&&selectedLine()?.id!==target.id){closeColorPalette();return;}
  const input=$(`#${target.scope}-${target.key}`);if(!input){closeColorPalette();return;}
  if(!target.changed){editingField={target:input,changed:false};target.changed=true;}input.value=color;input.dispatchEvent(new Event('input',{bubbles:true}));
  if(close)closeColorPalette();
}
function stationPaintControls(n) {
  const config=normalizeSymbol(n),paints=normalizeSymbolColors(n);
  const members=nodeLines(n.id).filter(line=>line.visible),ink=map.theme==='night'?'#e3eadc':'#344038';
  const routeColor=map.theme==='mono'?'#30382e':members[0]?.color||'#627953';
  const outline=config.outline==='custom'?paints.outlineColor:config.outline==='line'?routeColor:config.shape==='auto'&&members.length<2?routeColor:ink;
  const interior=config.fill==='custom'?paints.fillColor:paperColor();
  const fixedInterior=['disc','open-capsule','double-circle'].includes(config.shape);
  return `<div class="station-paint-controls">${selectControl('Outline','symbolOutline',[{id:'ink',label:'Automatic'},{id:'line',label:'Line colors'},{id:'custom',label:'Custom'}],config.outline,'node')}${colorControl('Outline color','symbolOutlineColor',outline)}${fixedInterior?'':`${selectControl('Interior','symbolFill',[{id:'paper',label:'Background'},{id:'transparent',label:'See-through'},{id:'custom',label:'Custom'}],config.fill,'node')}${colorControl('Interior color','symbolFillColor',interior)}`}</div>`;
}
function stationSymbolControls(n) {
  const raw=n;
  const crossCornerChoice=crossUsesDefaults(map,raw)?normalizeDefaults(map.defaults).crossCornerStyle:raw.symbolCornerStyle||'inherit';
  n=effectiveNode(map,n);
  const config=normalizeSymbol(n), previewColors=['#888888','#bbbbbb'];
  const rotates=!['auto','circle','disc'].includes(config.shape);
  const hasLength=['capsule','open-capsule','pill-dots','linked','linked-dots','double-circle','cross'].includes(config.shape)&&!(config.shape==='cross'&&n.symbolCrossMode==='manual');
  const rotation=rotates?rangeControl({key:'symbolAngle',label:'Rotation',value:config.angle,min:-180,max:180,step:1,precise:true}):'';
  const presets=rotates?`<div class="preset-row angle-presets">${[0,45,90,135].map(a=>`<button type="button" data-symbol-angle="${a}" class="${config.angle===a?'active':''}">${a}°</button>`).join('')}</div>`:'';
  const picker=`<div class="symbol-picker" role="group" aria-label="Station symbol">${SYMBOL_TYPES.map(type=>`<button type="button" class="symbol-option ${config.shape===type.id?'active':''}" data-symbol="${type.id}" title="${esc(type.description)}" aria-label="${esc(type.label)} station symbol" aria-pressed="${config.shape===type.id}"><svg viewBox="0 0 64 44" aria-hidden="true"><path d="M2 22h60" stroke="${previewColors[0]}" stroke-width="6"/><path d="M32 2v40" stroke="${previewColors[1]}" stroke-width="6"/>${renderStationSymbol({x:32,y:22,symbol:type.id,symbolLength:20,symbolSize:.8},{colors:previewColors,ink:'#333333',paper:'#fff',interchange:true})}</svg><span>${esc(type.label)}</span></button>`).join('')}</div>`;
  return `<details class="appearance-section" data-inspector-section-key="station"><summary>Station appearance <span>12 symbols</span></summary>${n.symbol==='cross'?`<label class="inherit-toggle"><input id="inherit-cross" type="checkbox" ${crossUsesDefaults(map,n)?'checked':''}> Use map cross style</label><p id="cross-style-status" class="control-help">${crossUsesDefaults(map,n)?'Follows the shared cross appearance. Editing appearance creates a local override.':'Custom appearance for this cross.'}</p>`:''}${stationPaintControls(n)}${picker}${rotation}${presets}${crossControls(n)}${rangeControl({key:'symbolSize',label:'Symbol size',value:config.size,min:.6,max:3,step:.1})}${hasLength?rangeControl({key:'symbolLength',label:'Connector length',value:config.length,min:12,max:60,step:2}):''}${n.symbol==='cross'?rangeControl({key:'symbolArmWidth',label:'Cross arm width',value:n.symbolArmWidth||10,min:6,max:24})+selectControl('Cross corners','symbolCornerStyle',[{id:'inherit',label:'Match route corners'},...CORNER_STYLES],crossCornerChoice,'node'):''}</details>`;
}
const textStyleKeys=Object.keys(normalizeTextStyle());
function makeTextCustom(node){Object.assign(node,normalizeTextStyle(effectiveLabel(map,node)),{labelStyleMode:'custom'});}
function textStyleControls(node,global=false){
  const n=global?normalizeDefaults(map.defaults):effectiveLabel(map,node),scope=global?'default':'node';
  const number=(key,label,min,max,step=1)=>`<div class="field"><label for="${scope}-${key}">${label}</label><input class="input" id="${scope}-${key}" type="number" min="${min}" max="${max}" step="${step}" value="${n[key]}" data-${scope}-field="${key}"></div>`;
  return `<div class="text-style-controls">${global?'':`<label class="inherit-toggle"><input type="checkbox" id="inherit-text" ${labelUsesDefaults(node)?'checked':''}> Use global text style</label>`}${selectControl('Name shape','labelShape',[{id:'plain',label:'Plain text'},{id:'capsule',label:'Capsule'}],n.labelShape,scope)}${colorControl('Text color','labelColor',n.labelColor,scope,true)}<div class="capsule-text-controls" data-capsule-controls="${scope}" ${n.labelShape!=='capsule'?'hidden':''}>${colorControl('Capsule fill','labelFillColor',n.labelFillColor,scope,true)}${colorControl('Capsule outline','labelBorderColor',n.labelBorderColor,scope,true,automaticLabelColor('labelBorderColor',n))}<div class="field-pair">${number('labelPadding','Padding',0,40,.5)}${number('labelBorderWidth','Border width',0,8,.5)}</div></div><div class="preset-row"><button data-text-preset="horizontal" data-text-scope="${scope}">Horizontal</button><button data-text-preset="diagonal" data-text-scope="${scope}">45° from stop</button></div><div class="field-pair">${number('labelFontSize','Text size',10,96)}${selectControl('Weight','labelWeight',[{id:400,label:'Regular'},{id:500,label:'Medium'},{id:600,label:'Semibold'},{id:700,label:'Bold'}],n.labelWeight,scope)}</div>${selectControl('Typeface','labelFontFamily',[{id:'sans',label:'Sans serif'},{id:'serif',label:'Serif'},{id:'mono',label:'Monospace'}],n.labelFontFamily,scope)}<div class="field-pair">${number('labelAngle','Text angle °',-180,180)}${selectControl('Alignment','labelAnchor',[{id:'auto',label:'Auto'},{id:'start',label:'Start'},{id:'middle',label:'Center'},{id:'end',label:'End'}],n.labelAnchor,scope)}</div><div class="field-pair">${selectControl('Attachment','labelFromStop',[{id:false,label:'Side of stop'},{id:true,label:'Start from stop'}],n.labelFromStop,scope)}${number('labelGap','Gap',0,160)}</div></div>`;
}
function syncLabelPaintControls(scope,style) {
  for(const key of ['labelColor','labelFillColor','labelBorderColor']) {
    const automatic=style[key]==='auto',color=automatic?automaticLabelColor(key,style):style[key];
    const input=$(`#${scope}-${key}`);if(input&&input!==document.activeElement)input.value=color;
    const preview=$(`[data-paint-preview="${scope}-${key}"]`);if(preview)preview.style.setProperty('--paint-color',color);
    $$(`[data-reset-text-color="${scope}"][data-reset-label-color="${key}"]`).forEach(button=>{button.classList.toggle('active',automatic);button.setAttribute('aria-pressed',String(automatic));});
  }
  $$(`[data-capsule-controls="${scope}"]`).forEach(el=>el.hidden=style.labelShape!=='capsule');
}
function labelPlacementControls(n){
  return `<div class="label-placement"><div class="field">${selectControl('Name position','labelPosition',['top','right','bottom','left'].map(id=>({id,label:id[0].toUpperCase()+id.slice(1)})),n.labelPosition,'node')}</div><div class="field-pair">${['X','Y'].map(axis=>`<div class="field"><label for="label-offset-${axis}">Offset ${axis}</label><input class="input" id="label-offset-${axis}" type="number" min="-2000" max="2000" step="0.1" data-node-field="labelOffset${axis}" value="${n['labelOffset'+axis]||0}"></div>`).join('')}</div><button class="button outlined full-width" data-action="reset-label-position">Reset name position</button><p class="label-drag-hint">Drag the name to place it. Its offset stays attached to the stop.</p></div>`;
}
function cornerControls(line) {
  const radius=Number.isFinite(line.cornerRadius)?line.cornerRadius:20;
  return `<div class="corner-controls">${rangeControl({key:'cornerRadius',label:'Corner radius',value:radius,min:0,max:160,node:false})}<div class="preset-row">${[[0,'0'],[12,'12'],[32,'32'],[64,'64']].map(([r,label])=>`<button type="button" data-corner-radius="${r}" class="${radius===r?'active':''}">${label}</button>`).join('')}</div><p class="control-help">In map units. Corners tighten near stops to keep them on the route. Shift-click to add a bend for wider curves.</p></div>`;
}
function selectControl(label,key,options,value,scope='default') {
  const id=`${scope}-${key}`;
  return `<div class="field"><label for="${id}">${label}</label><select id="${id}" data-${scope}-field="${key}">${options.map(option=>`<option value="${option.id}" ${option.id===value?'selected':''}>${esc(option.label)}</option>`).join('')}</select></div>`;
}
function lineStyleControls(line) {
  const inherited=lineUsesDefaults(map,line);
  return `${activeRoutePointId&&line.nodeIds.includes(activeRoutePointId)&&getNode(activeRoutePointId)?.kind==='bend'?`<button class="button outlined full-width remove-route-point" data-action="remove-route-point">${icon('trash')} Remove selected bend</button>`:''}<label class="inherit-toggle"><input type="checkbox" id="inherit-line" ${inherited?'checked':''}> Use map defaults</label><p id="line-style-status" class="control-help">${inherited?'Follows the map style. Editing a control creates an override for this line.':'Custom style for this line. Turn on map defaults to link it again.'}</p>${selectControl('Line pattern','style',LINE_STYLES,line.style,'line')}<div class="field-pair">${selectControl('Corner shape','cornerStyle',CORNER_STYLES,line.cornerStyle,'line')}${selectControl('Route geometry','routing',[{id:'octilinear',label:'45° diagonals'},{id:'orthogonal',label:'90° right angles'}],line.routing,'line')}</div>${rangeControl({key:'width',label:'Line weight',value:line.width,min:4,max:24,node:false})}${cornerControls(line)}<div class="onboard-note">Drag a diamond handle or any route segment to reshape it locally. Stops and connections stay fixed. Double-click a bend to remove it.</div>`;
}
function refreshGlobalPreview() {
  const host=$('#global-style-preview');if(!host)return;
  const d=normalizeDefaults(map.defaults), line={...d,color:'#777777'};
  const path=roundedPath(routePoints([{x:15,y:80},{x:100,y:80},{x:165,y:20},{x:280,y:20}],d.routing),d.cornerRadius,[],d.cornerStyle);
  const node=effectiveNode(map,{symbol:'cross',x:0,y:0,crossStyleMode:'global'});
  const rays=d.routing==='orthogonal'?[0,90,180,-90]:[0,45,180,-135];
  host.innerHTML=`<div><svg viewBox="0 0 300 105" aria-label="Route style preview">${renderLineStroke(path,line,{color:'#777777',paper:'#ffffff'})}</svg><span>Route preview</span></div><div><svg viewBox="-130 -120 260 240" aria-label="Cross style preview"><path d="${d.routing==='orthogonal'?'M-120 0H120M0 -110V110':'M-120 0H120M-90 -90L90 90'}" stroke="#bdbdbd" stroke-width="8"/>${renderStationSymbol(node,{directions:rays.map(angle=>({angle})),colors:['#888888','#bbbbbb'],ink:'#333333',paper:'#ffffff',interchange:true})}</svg><span>Cross preview</span></div>`;
  $$('#modal [data-default-field]').filter(el=>textStyleKeys.includes(el.dataset.defaultField)||['crossOutline','crossFill','crossOutlineColor','crossFillColor'].includes(el.dataset.defaultField)).forEach(el=>{if(el!==document.activeElement){const key=el.dataset.defaultField;el.value=d[key]==='auto'&&key.endsWith('Color')?automaticLabelColor(key,d):d[key];}});
  $$('#modal [data-paint-preview]').forEach(button=>{const key=button.dataset.paletteField;button.style.setProperty('--paint-color',d[key]==='auto'?automaticLabelColor(key,d):d[key]);});
  syncLabelPaintControls('default',d);
  const counts=$('#global-style-counts');if(counts)counts.textContent=`${map.lines.filter(l=>lineUsesDefaults(map,l)).length} of ${map.lines.length} lines · ${map.nodes.filter(n=>n.symbol==='cross'&&crossUsesDefaults(map,n)).length} of ${map.nodes.filter(n=>n.symbol==='cross').length} crosses follow defaults`;
}
function openStyleDialog() {
  const d=normalizeDefaults(map.defaults);
  openModal(`${modalHead('Global style')}<p class="modal-intro">Set the shared appearance here. Individual lines and cross stops can keep their own overrides.</p><div id="global-style-preview" class="global-style-preview"></div><div class="global-style-columns"><section><h3>Routes & corners</h3>${selectControl('Line pattern','style',LINE_STYLES,d.style)}<div class="field-pair">${selectControl('Corner shape','cornerStyle',CORNER_STYLES,d.cornerStyle)}${selectControl('Route geometry','routing',[{id:'octilinear',label:'45° diagonals'},{id:'orthogonal',label:'90° right angles'}],d.routing)}</div>${rangeControl({key:'cornerRadius',label:'Corner radius',value:d.cornerRadius,min:0,max:160,globalField:true})}${rangeControl({key:'width',label:'Line weight',value:d.width,min:4,max:24,globalField:true})}<button class="button outlined full-width" data-action="all-lines-global">Apply defaults to every line</button></section><section><h3>Cross stops</h3>${selectControl('Cross corners','crossCornerStyle',[{id:'inherit',label:'Match route corners'},...CORNER_STYLES],d.crossCornerStyle)}${rangeControl({key:'crossSize',label:'Cross size',value:d.crossSize,min:.6,max:3,step:.1,globalField:true})}${rangeControl({key:'crossLength',label:'Arm reach',value:d.crossLength,min:12,max:60,globalField:true})}${rangeControl({key:'crossWidth',label:'Arm width',value:d.crossWidth,min:6,max:24,globalField:true})}<div class="field-pair">${selectControl('Outline','crossOutline',[{id:'ink',label:'Map ink'},{id:'line',label:'Line colors'},{id:'custom',label:'Custom color'}],d.crossOutline)}${selectControl('Interior','crossFill',[{id:'paper',label:'Map background'},{id:'transparent',label:'See-through'},{id:'custom',label:'Custom color'}],d.crossFill)}</div>${colorControl('Cross outline color','crossOutlineColor',d.crossOutlineColor,'default')}${colorControl('Cross interior color','crossFillColor',d.crossFillColor,'default')}<button class="button outlined full-width" data-action="all-crosses-global">Apply defaults to every cross</button></section><section class="global-text-section"><h3>Stop names</h3>${textStyleControls(null,true)}<button class="button outlined full-width" data-action="all-text-global">Apply text style to every stop</button></section></div><div class="modal-footer"><span id="global-style-counts"></span><button class="button primary" data-action="close-modal">Done</button></div>`);
  $('#modal').classList.add('style-dialog');refreshGlobalPreview();
}
let inspectorSelectionKey='';
function batchScope(html,type) {
  return html.replaceAll(`data-${type}-field=`,`data-batch-${type}-field=`)
    .replaceAll(`id="${type}-`,`id="batch-${type}-`).replaceAll(`for="${type}-`,`for="batch-${type}-`)
    .replaceAll(`data-palette-scope="${type}"`,`data-palette-scope="batch-${type}"`)
    .replaceAll(`data-paint-preview="${type}-`,`data-paint-preview="batch-${type}-`)
    .replaceAll(`data-reset-text-color="${type}"`,`data-reset-text-color="batch-${type}"`)
    .replaceAll(`data-text-scope="${type}"`,`data-text-scope="batch-${type}"`)
    .replaceAll(`data-capsule-controls="${type}"`,`data-capsule-controls="batch-${type}"`)
    .replaceAll('id="inherit-','id="batch-inherit-');
}
function batchInspector(close) {
  const nodes=selectedRecords(map,selection,'node'),lines=selectedRecords(map,selection,'line');
  let html=`<div class="inspector-kicker">Selection ${close}</div><h2 class="inspector-title batch-title">${selectionItems(selection).length} selected</h2><p class="batch-counts">${[nodes.length?`${nodes.length} ${nodes.length===1?'stop':'stops'}`:'',lines.length?`${lines.length} ${lines.length===1?'line':'lines'}`:''].filter(Boolean).join(' · ')}</p>`;
  if(nodes.length) {
    const n=effectiveNode(map,nodes[0]),config=normalizeSymbol(n);
    const picker=`<div class="symbol-picker" role="group" aria-label="Station symbol">${SYMBOL_TYPES.map(type=>`<button type="button" class="symbol-option" data-batch-symbol="${type.id}" title="${esc(type.description)}" aria-label="${esc(type.label)} station symbol" aria-pressed="false"><svg viewBox="0 0 64 44" aria-hidden="true"><path d="M2 22h60M32 2v40" stroke="#bbbbbb" stroke-width="6"/>${renderStationSymbol({x:32,y:22,symbol:type.id,symbolLength:20,symbolSize:.8},{colors:['#888','#bbb'],ink:'#333',paper:'#fff',interchange:true})}</svg></button>`).join('')}</div>`;
    const rotates=nodes.some(node=>!['auto','circle','disc'].includes(node.symbol));
    const length=nodes.some(node=>['capsule','open-capsule','pill-dots','linked','linked-dots','double-circle','cross'].includes(node.symbol));
    const crosses=nodes.some(node=>node.symbol==='cross');
    html+=`<details class="appearance-section" data-inspector-section-key="batch-text"><summary>Stop text</summary>${batchScope(textStyleControls(nodes[0])+labelPlacementControls(nodes[0]),'node')}</details><details class="appearance-section" data-inspector-section-key="batch-station"><summary>Stop appearance</summary>${batchScope(stationPaintControls({...n,symbol:'auto'}),'node')}${picker}${rotates?batchScope(rangeControl({key:'symbolAngle',label:'Rotation',value:config.angle,min:-180,max:180,precise:true}),'node'):''}${batchScope(rangeControl({key:'symbolSize',label:'Symbol size',value:config.size,min:.6,max:3,step:.1}),'node')}${length?batchScope(rangeControl({key:'symbolLength',label:'Connector length',value:config.length,min:12,max:60,step:2}),'node'):''}${crosses?batchScope(rangeControl({key:'symbolArmWidth',label:'Cross arm width',value:n.symbolArmWidth||10,min:6,max:24})+selectControl('Cross corners','symbolCornerStyle',[{id:'inherit',label:'Match route corners'},...CORNER_STYLES],n.symbolCornerStyle||'inherit','node'),'node'):''}</details>`;
  }
  if(lines.length) {
    const line=effectiveLine(map,lines[0]);
    html+=`<details class="appearance-section" data-inspector-section-key="batch-line"><summary>Line appearance</summary>${batchScope(colorControl('Line color','color',line.color,'line')+lineStyleControls(line),'line')}</details>`;
  }
  return html+`<div class="delete-area"><button class="button danger full-width" data-action="delete">${icon('trash')} Delete selection</button></div>`;
}
function syncBatchControls() {
  if(selection?.type!=='multi')return;
  for(const type of ['node','line']) {
    $$(`[data-batch-${type}-field]`).forEach(el=>{
      const key=el.dataset[type==='node'?'batchNodeField':'batchLineField'];
      const state=batchStyleValue(map,selection,type,key);let value=state.value;
      if(value==='auto'&&['labelColor','labelFillColor','labelBorderColor'].includes(key))value=automaticLabelColor(key,effectiveLabel(map,selectedRecords(map,selection,'node')[0]||{}));
      el.dataset.mixed=String(state.mixed);
      if(el.tagName==='SELECT') {
        el.querySelector('[data-mixed-option]')?.remove();
        if(state.mixed)el.insertAdjacentHTML('afterbegin','<option value="" data-mixed-option disabled>Mixed</option>');
        el.value=state.mixed?'':String(value);
      } else if(el.type==='range') {
        el.value=value;el.setAttribute('aria-valuetext',state.mixed?'Mixed':formatControlValue(key,value));
      } else {const display=state.mixed?'':String(value);if(el.value!==display)el.value=display;el.placeholder=state.mixed?'Mixed':'';}
      const field=el.closest('.range-field');
      if(field)field.querySelectorAll('[data-value-for]').forEach(out=>out.textContent=state.mixed?'Mixed':formatControlValue(key,value));
      const swatch=$(`[data-paint-preview="batch-${type}-${key}"]`);
      if(swatch){swatch.dataset.mixed=String(state.mixed);swatch.style.setProperty('--paint-color',value);}
    });
  }
  for(const [id,type,key] of [['batch-inherit-text','node','labelStyleMode'],['batch-inherit-line','line','styleMode']]) {
    const el=$(`#${id}`);if(!el)continue;const state=batchStyleValue(map,selection,type,key);
    el.checked=state.value==='global'&&!state.mixed;el.indeterminate=state.mixed;
  }
  const shape=batchStyleValue(map,selection,'node','symbol');
  $$('[data-batch-symbol]').forEach(el=>{const active=!shape.mixed&&shape.value===el.dataset.batchSymbol;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
  $$('[data-reset-text-color="batch-node"]').forEach(el=>{const state=batchStyleValue(map,selection,'node',el.dataset.resetLabelColor||'labelColor'),active=!state.mixed&&state.value==='auto';el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
  const labelShape=batchStyleValue(map,selection,'node','labelShape');
  $$('[data-capsule-controls="batch-node"]').forEach(el=>el.hidden=!labelShape.mixed&&labelShape.value!=='capsule');
  $$('[data-corner-radius]').forEach(el=>{const state=batchStyleValue(map,selection,'line','cornerRadius');el.classList.toggle('active',!state.mixed&&state.value===Number(el.dataset.cornerRadius));});
}
function renderInspector() {
  const n=selectedNode(), rawLine=selectedLine(), l=rawLine?effectiveLine(map,rawLine):null;
  const key=`${presenting}:${selectionKey(selection)}`;
  const opened=key===inspectorSelectionKey?new Set($$('#inspector-content details[data-inspector-section-key][open]').map(el=>el.dataset.inspectorSectionKey)):new Set();
  const tab=key===inspectorSelectionKey?$('#inspector-content [data-inspector-tab][aria-pressed="true"]')?.dataset.inspectorTab||'style':'style';
  if(key!==inspectorSelectionKey){$('#inspector-content').scrollTop=0;inspectorSelectionKey=key;}
  $('#inspector').classList.toggle('has-selection',!!selection);
  const close=`<button class="icon-button" data-action="close-selection" aria-label="Close details" title="Close">${icon('close')}</button>`;
  if(presenting) { $('#inspector-content').innerHTML='';return; }
  if(selection?.type==='multi') {
    $('#inspector-content').innerHTML=batchInspector(close);
    syncBatchControls();
  } else if(n) {
    const bend=n.kind==='bend';
    const tabs=`<div class="inspector-tabs" role="group" aria-label="Station properties"><button type="button" data-inspector-tab="style" aria-pressed="${tab==='style'}">Style</button><button type="button" data-inspector-tab="content" aria-pressed="${tab==='content'}">Content</button></div>`;
    $('#inspector-content').innerHTML=`<div class="inspector-kicker">${bend?'Bend':'Station'} ${close}</div>${bend?'<h2 class="inspector-title">Route bend</h2>':''}${!bend?`<div class="field inspector-name-field"><label for="station-name">Name</label><input class="input inspector-name" title="Rename stop" id="station-name" data-node-field="name" maxlength="100" value="${esc(n.name)}"></div><div class="station-continue-actions">${endpointButtons(n)}</div>${tabs}<div data-inspector-section="style" ${tab!=='style'?'hidden':''}><details class="appearance-section" data-inspector-section-key="text"><summary>Text</summary>${textStyleControls(n)}${labelPlacementControls(n)}</details>${stationSymbolControls(n)}</div><div data-inspector-section="content" ${tab!=='content'?'hidden':''}><div class="field"><div class="description-label"><label for="station-description">Description</label><span>Markdown</span></div><textarea id="station-description" data-node-field="description" maxlength="10000" placeholder="Write a description in Markdown…">${esc(n.description)}</textarea><details class="description-preview" data-inspector-section-key="description-preview"><summary>Preview</summary><div id="description-preview" class="markdown-body">${renderDescription(n.description)||'<p class="story-empty">No description yet.</p>'}</div></details></div><div class="field"><label for="station-url">Link</label><input class="input" type="url" id="station-url" data-node-field="url" value="${esc(n.url)}" placeholder="https://…"></div></div>`:''}<div class="field"><span class="field-label">Connected lines</span><div class="station-lines">${nodeLines(n.id).map(l=>`<button class="station-line-tag" data-select-line="${esc(l.id)}" style="--line-color:${l.color}"><i></i>${esc(l.name)}</button>`).join('')||'<span class="inspector-desc">No connected lines</span>'}</div></div><div class="inspector-divider"></div><button class="button outlined full-width" data-action="toggle-bend">${icon(bend?'station':'route')}${bend?'Convert to station':'Convert to bend'}</button><div class="delete-area"><button class="button danger full-width" data-action="delete">${icon('trash')} Delete ${bend?'bend':'station'}</button></div>`;
  } else if(l) {
    $('#inspector-content').innerHTML=`<div class="inspector-kicker">Line ${close}</div><div class="field inspector-name-field"><label for="line-name">Name</label><input class="input inspector-name" title="Rename line" id="line-name" maxlength="100" data-line-field="name" value="${esc(l.name)}"></div><div class="field compact-field"><label for="line-code">Badge</label><input class="input" id="line-code" maxlength="5" data-line-field="code" value="${esc(l.code)}"></div><details class="appearance-section" data-inspector-section-key="line"><summary>Line appearance</summary>${colorControl('Line color','color',l.color,'line')}${lineStyleControls(l)}</details><button class="button primary full-width" data-action="extend-line">${icon('route')} ${drawing&&activeLineId===l.id?'Drawing… Enter to finish':'Continue line'}</button><div class="delete-area"><button class="button danger full-width" data-action="delete">${icon('trash')} Delete line</button></div>`;
  } else {
    const stops=map.nodes.filter(node=>node.kind!=='bend').length;
    $('#inspector-content').innerHTML=`<div class="inspector-kicker">Project</div><div class="field inspector-name-field"><label for="project-title">Project title</label><input class="input inspector-name" id="project-title" data-map-field="title" title="Rename project" maxlength="100" value="${esc(map.title)}"></div><div class="field"><label for="project-subtitle">Subtitle</label><textarea class="project-subtitle" id="project-subtitle" data-map-field="subtitle" maxlength="200" rows="3" placeholder="Add a short description…">${esc(map.subtitle)}</textarea></div><dl class="project-summary" aria-label="Project overview"><div><dt>${map.lines.length===1?'line':'lines'}</dt><dd>${map.lines.length}</dd></div><div><dt>${stops===1?'stop':'stops'}</dt><dd>${stops}</dd></div></dl>`;
  }
  $$('#inspector-content details[data-inspector-section-key]').forEach(el=>el.open=opened.has(el.dataset.inspectorSectionKey));
}
function endpointLines(node) {
  return node&&node.kind!=='bend'?visibleLines().filter(line=>lineEndpoint(line,node.id)):[];
}
function endpointButtons(node) {
  const lines=endpointLines(node);
  return lines.map(line=>`<button class="button outlined" data-continue-line="${esc(line.id)}" data-continue-node="${esc(node.id)}" title="Continue from this ${lineEndpoint(line,node.id)==='start'?'first':'last'} stop">${icon('plus')} ${lines.length>1?`Continue ${esc(line.name)}`:'Continue line'}</button>`).join('');
}
function renderEndpointActions() {
  const host=$('#endpoint-actions'),node=selectedNode();
  if(!host)return;
  const lines=endpointLines(node);
  if(presenting||tool!=='select'||!lines.length||drag?.moved){host.hidden=true;return;}
  const matrix=canvas.getScreenCTM();if(!matrix){host.hidden=true;return;}
  const point=new DOMPoint(node.x,node.y).matrixTransform(matrix),frame=canvasArea.getBoundingClientRect();
  const x=point.x-frame.left,y=point.y-frame.top;
  const leftBlocked=wideLayout()&&panels.left?$('#lines-panel').getBoundingClientRect().right-frame.left:0;
  const rightBlocked=wideLayout()&&panels.right?$('#inspector').getBoundingClientRect().left-frame.left:frame.width;
  if(x<leftBlocked||x>rightBlocked||y<0||y>frame.height){host.hidden=true;return;}
  host.innerHTML=endpointButtons(node);host.hidden=false;
  host.style.left=`${Math.max(12,Math.min(x+16,frame.width-host.offsetWidth-12))}px`;
  host.style.top=`${Math.max(12,Math.min(y+18,frame.height-host.offsetHeight-90))}px`;
}
function continueFromEndpoint(lineId,nodeId) {
  const line=getLine(lineId),side=lineEndpoint(line,nodeId);if(!side)return;
  if(drawing)finishLine(false);
  activeLineId=lineId;drawingEnd=side;drawing=true;selection={type:'line',id:lineId};activeRoutePointId=null;
  setTool('line');render();canvas.focus();
}
function safeUrl(value) { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)?u.href:null; }catch{return null;} }
let storyNodeKey='';
function renderStationStory() {
  const host=$('#station-story'),node=selectedNode();
  if(!presenting||!node||node.kind==='bend'){host.hidden=true;host.innerHTML='';storyNodeKey='';return;}
  const key=JSON.stringify([node.id,node.name,node.description,node.url]);
  if(key!==storyNodeKey) {
    storyNodeKey=key;
    host.innerHTML=`<div class="station-story-heading"><h2 id="station-story-title">${esc(node.name)}</h2><button class="icon-button" data-action="close-story" aria-label="Close description" title="Close">${icon('close')}</button></div><div class="station-story-content markdown-body">${renderDescription(node.description)||'<p class="story-empty">No description yet.</p>'}${safeUrl(node.url)?`<p><a href="${esc(safeUrl(node.url))}" target="_blank" rel="noopener noreferrer">Open link ↗</a></p>`:''}</div>`;
  }
  positionStationStory();
}
function positionStationStory() {
  const host=$('#station-story'),raw=selectedNode();
  if(!presenting||!raw||!host.innerHTML){host.hidden=true;return;}
  const matrix=canvas.getScreenCTM();if(!matrix){host.hidden=true;return;}
  const point=new DOMPoint(raw.x,raw.y).matrixTransform(matrix),frame=canvasArea.getBoundingClientRect();
  const x=point.x-frame.left,y=point.y-frame.top;
  if(x<0||x>frame.width||y<0||y>frame.height){host.hidden=true;return;}
  host.hidden=false;
  const node=effectiveNode(map,raw),interchange=nodeLines(raw.id).filter(l=>l.visible).length>1;
  const radius=symbolExtent(node,interchange,node.symbol==='cross'?stationDirections(map,node.id):[])*Math.hypot(matrix.a,matrix.b);
  const placed=stationStoryPosition({x,y,radius},{width:host.offsetWidth,height:host.offsetHeight},{width:frame.width,height:frame.height});
  host.style.left=`${placed.left}px`;host.style.top=`${placed.top}px`;
  host.style.setProperty('--story-arrow',`${placed.arrow}px`);host.dataset.placement=placed.placement;
}
new ResizeObserver(()=>positionStationStory()).observe($('#station-story'));

function setTool(next) {
  if(drawing&&next!=='line')finishLine(false);
  tool=next; canvas.dataset.tool=tool;
  $$('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});
  $('#ghost-layer').innerHTML=''; if($('#route-edit-layer'))renderRouteHandles();renderEndpointActions(); updateHint();
}
function updateHint() {
  const el=$('#mode-hint'); let message='';
  if(tool==='line')message=drawing?'Click to add stops · Shift-click for a bend <kbd>Enter</kbd> finish':'Click anywhere to start a new line';
  if(tool==='stop')message='Click a route to insert a stop · click empty space for a standalone stop';
  if(tool==='hand')message='Drag to explore · scroll to zoom';
  el.innerHTML=message;el.classList.toggle('visible',!!message&&!presenting);
}
function createLine() {
  drawingEnd='end';
  const lid=id('line'), i=map.lines.length;
  commit(()=>{map.lines.push({id:lid,name:`Line ${i+1}`,code:String(i+1).padStart(2,'0'),color:palette[i%palette.length],width:8,cornerRadius:20,cornerStyle:'rounded',routing:'octilinear',style:'solid',styleMode:'global',nodeIds:[],visible:true});selection={type:'line',id:lid};activeLineId=lid;drawing=true;});
  setTool('line'); notify('Click the canvas to place your first stop.');
}
function finishLine(message=true) { drawing=false;drawingEnd='end'; $('#ghost-layer').innerHTML=''; if(tool==='line')setTool('select'); updateHint();renderInspector();if(message)notify('Route ready. Select any stop to add its story.'); }
function makeNode(point,bend=false) {
  return {id:id(bend?'bend':'stop'),x:point.x,y:point.y,name:`Stop ${map.nodes.filter(n=>n.kind!=='bend').length+1}`,description:'',url:'',kind:bend?'bend':'station',labelPosition:'top',labelAngle:0,symbol:'auto',symbolAngle:0,symbolSize:1,symbolLength:28,symbolOutline:'ink',symbolFill:'paper',crossStyleMode:'global'};
}
function nearestNode(p,exclude) {
  const max=18*view.width/canvas.clientWidth;
  return map.nodes.filter(n=>n.id!==exclude&&n.kind!=='bend'&&(!nodeLines(n.id).length||nodeLines(n.id).some(l=>l.visible))).map(n=>({n,d:Math.hypot(n.x-p.x,n.y-p.y)})).filter(a=>a.d<max).sort((a,b)=>a.d-b.d)[0]?.n;
}
function addLinePoint(point,existing,bend=false) {
  if(!drawing||!getLine(activeLineId))createLine();
  const l=getLine(activeLineId), last=extensionAnchor(l,drawingEnd);
  if(existing&&existing.id===last)return;
  commit(()=>{
    let n=existing;
    if(!n){n=makeNode(snapGrid?snapPoint(point):point,bend);map.nodes.push(n);}
    if(n.kind==='bend'&&!bend)n.kind='station';
    appendRouteStop(l,n.id,drawingEnd);selection={type:'line',id:l.id};
  });
}
function addStop(point,lineId) {
  const existing=nearestNode(point); if(existing){setSelection('node',existing.id);return;}
  const candidates=lineId&&getLine(lineId)?[getLine(lineId)]:visibleLines();
  const nearest=candidates.map(l=>({l,...nearestOnLine(point,lineNodes(l),effectiveLine(map,l).routing)})).sort((a,b)=>a.distance-b.distance)[0];
  const onLine=nearest && (lineId || nearest.distance<22*view.width/canvas.clientWidth);
  const p=onLine?{x:nearest.x,y:nearest.y}:snapGrid?snapPoint(point):point;
  commit(()=>{const n=makeNode(p);map.nodes.push(n);if(onLine)nearest.l.nodeIds.splice(nearest.insertIndex,0,n.id);selection={type:'node',id:n.id};});
  if(!onLine)notify('Stop added. Draw a route through it to connect it.');
}
function removeSelection() {
  if(!selection)return;
  commit(()=>{
    selectionItems(selection).filter(item=>item.type==='node').forEach(item=>removeMapItem(map,item));
    selectionItems(selection).filter(item=>item.type==='line').forEach(item=>removeMapItem(map,item));
    activeRoutePointId=null;
    selection=null;drawing=false;activeLineId=null;
  });setTool('select');
}

function applyView(next,animate=false) {
  cancelAnimationFrame(animateFrame);
  const start={...view};
  if(!animate){view=next;updateView();return;}
  const since=performance.now();
  function tick(now){const t=Math.min((now-since)/260,1),e=1-(1-t)**3; for(const k of ['x','y','width','height'])view[k]=start[k]+(next[k]-start[k])*e; updateView();if(t<1)animateFrame=requestAnimationFrame(tick);}
  animateFrame=requestAnimationFrame(tick);
}
function updateView(){canvas.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);$('#zoom-value').textContent=`${Math.round(fitWidth/view.width*100)}%`;renderRouteHandles();renderEndpointActions();positionStationStory();}
function fitMap(animate=true) {
  const width=canvas.clientWidth,height=canvas.clientHeight;
  if(!width||!height)return;
  const nodes=map.nodes.filter(n=>!nodeLines(n.id).length||nodeLines(n.id).some(l=>l.visible));
  const b=getBounds(nodes,0), mapW=Math.max(b.width,400),mapH=Math.max(b.height,250);
  const leftInset=wideLayout()&&panels.left&&!presenting?$('#lines-panel').getBoundingClientRect().width+24:0;
  const rightInset=wideLayout()&&panels.right?$('#inspector').getBoundingClientRect().width+24:0;
  const scale=Math.min(Math.max(120,width-leftInset-rightInset-96)/(mapW+160),Math.max(120,height-(presenting?260:180))/(mapH+80));
  const vw=width/scale,vh=height/scale;
  const next={x:b.x+b.width/2-vw/2-(leftInset-rightInset)/2/scale,y:b.y+b.height/2-vh/2-(presenting?24:0)/scale,width:vw,height:vh};
  fitWidth=vw;applyView(next,animate);
}
function zoom(factor,point=null) {
  const targetW=Math.min(fitWidth*5,Math.max(fitWidth*.13,view.width*factor)), ratio=targetW/view.width;
  const p=point||{x:view.x+view.width/2,y:view.y+view.height/2};
  applyView({x:p.x-(p.x-view.x)*ratio,y:p.y-(p.y-view.y)*ratio,width:targetW,height:view.height*ratio},!point);
}
function canvasPoint(event){const p=new DOMPoint(event.clientX,event.clientY);return p.matrixTransform(canvas.getScreenCTM().inverse());}
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(Math.max(-.25,Math.min(.25,e.deltaY*.0015))),canvasPoint(e));},{passive:false});
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0 && e.button!==1)return;
  suppressClick=false;
  const handleEl=e.target.closest('[data-route-handle]'), nodeEl=e.target.closest('[data-node-id]'), lineEl=e.target.closest('[data-line-id]'), p=canvasPoint(e);
  const now=performance.now(), previous=lastCanvasDown;
  const double=previous&&previous.tool===tool&&now-previous.time<350&&Math.hypot(e.clientX-previous.x,e.clientY-previous.y)<6;
  lastCanvasDown={time:now,x:e.clientX,y:e.clientY,tool,lineId:handleEl?.dataset.routeLine||lineEl?.dataset.lineId};
  const pan=tool==='hand'||spaceDown||e.button===1;
  if(pan){e.preventDefault();drag={type:'pan',clientX:e.clientX,clientY:e.clientY,view:{...view},moved:false};canvas.setPointerCapture(e.pointerId);canvas.classList.add('panning');return;}
  if(presenting){
    if(nodeEl){e.preventDefault();setSelection('node',nodeEl.dataset.nodeId);}
    else {setSelection(null);drag={type:'pan',clientX:e.clientX,clientY:e.clientY,view:{...view},moved:false};canvas.setPointerCapture(e.pointerId);}
    return;
  }
  if(tool==='line'){if(double&&drawing){finishLine();lastCanvasDown=null;}else addLinePoint(p,nodeEl?getNode(nodeEl.dataset.nodeId):nearestNode(p),e.shiftKey);return;}
  if(tool==='stop'){addStop(p,lineEl?.dataset.lineId);return;}
  if(e.shiftKey) {
    e.preventDefault();lastCanvasDown=null;
    if(nodeEl&&getNode(nodeEl.dataset.nodeId)?.kind!=='bend')setSelection('node',nodeEl.dataset.nodeId,null,true);
    else if(handleEl||lineEl)setSelection('line',handleEl?.dataset.routeLine||lineEl.dataset.lineId,null,true);
    return;
  }
  if(handleEl){
    const handle=readRouteHandle(handleEl), lineId=handle.lineId;
    setSelection('line',lineId,handle.nodeId);
    const action=double&&previous.lineId===lineId?(handle.nodeId?'remove-bend':'add-stop'):null;
    startRoutePointDrag(e,p,lineId,handle,action);return;
  }
  if(nodeEl&&e.target.closest('.station-label,.station-label-capsule')){
    const n=getNode(nodeEl.dataset.nodeId);setSelection('node',n.id);
    drag={type:'label',id:n.id,start:{x:n.labelOffsetX||0,y:n.labelOffsetY||0},point:p,clientX:e.clientX,clientY:e.clientY,moved:false,before:clone(map)};
    canvas.setPointerCapture(e.pointerId);e.preventDefault();return;
  }
  if(nodeEl){
    const n=getNode(nodeEl.dataset.nodeId);
    if(n.kind==='bend'){
      const members=nodeLines(n.id),line=members.find(l=>l.id===activeLineId)||members[0];
      if(line){setSelection('line',line.id,n.id);startRoutePointDrag(e,p,line.id,{nodeId:n.id,x:n.x,y:n.y,insertIndex:Math.max(1,line.nodeIds.indexOf(n.id))});return;}
    }
    setSelection('node',n.id);
    drag={type:'node',id:n.id,start:{x:n.x,y:n.y},point:p,clientX:e.clientX,clientY:e.clientY,moved:false,before:clone(map)};
    canvas.setPointerCapture(e.pointerId);
  } else if(lineEl){
    const lineId=lineEl.dataset.lineId;setSelection('line',lineId);
    startRoutePointDrag(e,p,lineId,null,double&&previous.lineId===lineId?'add-stop':null);
  }
  else {setSelection(null);drag={type:'pan',clientX:e.clientX,clientY:e.clientY,view:{...view},moved:false};canvas.setPointerCapture(e.pointerId);}
});
canvas.addEventListener('pointermove',e=>{
  const p=canvasPoint(e);
  if(drag){
    const dx=e.clientX-drag.clientX,dy=e.clientY-drag.clientY;
    if(Math.hypot(dx,dy)>3)drag.moved=true;
    if(!drag.moved)return;
    if(drag.type==='pan'){applyView({...drag.view,x:drag.view.x-dx*drag.view.width/canvas.clientWidth,y:drag.view.y-dy*drag.view.height/canvas.clientHeight});canvas.classList.add('panning');}
    else if(drag.type==='route-point'){
      if(!drag.edit){
        const line=getLine(drag.id);if(!line){cancelRoutePointDrag(e);return;}
        drag.edit=beginRoutePointEdit(map,drag.id,drag.anchor,{routing:effectiveLine(map,line).routing,nodeId:drag.nodeId,insertIndex:drag.insertIndex,createId:()=>id('bend')});
        if(!drag.edit){cancelRoutePointDrag(e);return;}
        activeRoutePointId=drag.edit.nodeId;
      }
      drag.changed=moveRoutePoint(map,drag.edit,{x:p.x-drag.point.x,y:p.y-drag.point.y},snapGrid?20:0);
      canvas.classList.add('editing-route');renderMap();
    }
    else if(drag.type==='label'){const n=getNode(drag.id);if(n){moveLabelOffset(n,drag.start,{x:p.x-drag.point.x,y:p.y-drag.point.y});renderMap();}}
    else {const n=getNode(drag.id);if(!n){endDrag(e);return;}const next={x:drag.start.x+p.x-drag.point.x,y:drag.start.y+p.y-drag.point.y};Object.assign(n,snapGrid?snapPoint(next):next);renderMap();
      const target=nearestNode(n,n.id);$('#ghost-layer').innerHTML=target?`<circle cx="${target.x}" cy="${target.y}" r="21" fill="none" stroke="${colorForNode(target.id)}" stroke-width="2" stroke-dasharray="4 3"/>`:'';
    }return;
  }
  if(presenting)return;
  if(tool==='line'&&drawing){const l=effectiveLine(map,getLine(activeLineId)),last=extensionAnchor(l,drawingEnd);if(!last)return;const end=nearestNode(p)|| (snapGrid?snapPoint(p):p);$('#ghost-layer').innerHTML=`<path class="ghost-line" stroke="${l.color}" d="${roundedPath(routePoints(drawingEnd==='start'?[end,getNode(last)]:[getNode(last),end],l.routing),l.cornerRadius,[],l.cornerStyle)}"/><circle class="ghost-stop" cx="${end.x}" cy="${end.y}" r="6" stroke="${l.color}"/>`;}
  else if(tool==='stop'){const nearest=visibleLines().map(l=>({l,...nearestOnLine(p,lineNodes(l),effectiveLine(map,l).routing)})).sort((a,b)=>a.distance-b.distance)[0];const on=nearest?.distance<22*view.width/canvas.clientWidth;const end=on?nearest:snapGrid?snapPoint(p):p;$('#ghost-layer').innerHTML=`<circle class="ghost-stop" cx="${end.x}" cy="${end.y}" r="7" stroke="${on?nearest.l.color:'#627953'}"/>`;}
});
function endDrag(e){
  if(!drag)return;
  if(drag.type==='route-point'&&!drag.moved&&drag.doubleAction){
    const finished=drag;drag=null;lastCanvasDown=null;
    if(e&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(finished.doubleAction==='remove-bend')removeActiveRoutePoint();else addStop(finished.anchor,finished.id);
    return;
  }
  if(drag.type==='label'&&drag.moved){undoStack.push(drag.before);if(undoStack.length>80)undoStack.shift();redoStack=[];save();render();}
  if(drag.type==='node'&&drag.moved){
    const n=getNode(drag.id),target=n?.kind==='bend'?null:nearestNode(n,n.id);
    if(target){map.lines.forEach(l=>{l.nodeIds=l.nodeIds.map(nid=>nid===n.id?target.id:nid).filter((nid,i,ids)=>i===0||nid!==ids[i-1]);});map.nodes=map.nodes.filter(node=>node.id!==n.id);selection={type:'node',id:target.id};notify('Stops connected. You made an interchange.');}
    undoStack.push(drag.before);if(undoStack.length>80)undoStack.shift();redoStack=[];save();render();
  }
  if(drag.type==='route-point'&&drag.edit){
    if(drag.changed){undoStack.push(drag.before);if(undoStack.length>80)undoStack.shift();redoStack=[];save();}
    else {map=drag.before;activeRoutePointId=drag.nodeId;}
    render();
  }
  suppressClick=drag.moved;drag=null;renderEndpointActions();canvas.classList.remove('panning','editing-route');$('#ghost-layer').innerHTML='';
  if(e&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',e=>{if(drag?.type==='label'){map=drag.before;drag=null;render();}else if(drag?.type==='route-point')cancelRoutePointDrag(e);else endDrag(e);});
canvas.addEventListener('pointerleave',()=>{if(!drag)$('#ghost-layer').innerHTML='';});
canvas.addEventListener('dblclick',e=>{if(presenting||suppressClick)return;if(drawing){e.preventDefault();finishLine();}});
canvas.addEventListener('keydown',e=>{
  const label=e.target.closest('[data-label-node]');if(!label||presenting||tool!=='select')return;
  const direction={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}}[e.key];
  if(!direction)return;e.preventDefault();e.stopPropagation();
  const nodeId=label.dataset.labelNode,n=getNode(nodeId),step=e.shiftKey?1:5;
  setSelection('node',nodeId);commit(()=>moveLabelOffset(n,{x:n.labelOffsetX||0,y:n.labelOffsetY||0},{x:direction.x*step,y:direction.y*step}));
  requestAnimationFrame(()=>$(`[data-label-node="${CSS.escape(nodeId)}"]`)?.focus());
});
canvas.addEventListener('keydown',e=>{
  const target=e.target.closest('[data-route-handle]');if(!target||presenting||tool!=='select')return;
  const handle=readRouteHandle(target),key=e.key.toLowerCase();
  if(key==='delete'||key==='backspace'){e.preventDefault();e.stopPropagation();if(handle.nodeId){setSelection('line',handle.lineId,handle.nodeId);removeActiveRoutePoint();}return;}
  const arrows={arrowleft:{x:-1,y:0},arrowright:{x:1,y:0},arrowup:{x:0,y:-1},arrowdown:{x:0,y:1}};
  const direction=arrows[key];if(!direction&&key!=='enter'&&key!==' ')return;
  e.preventDefault();e.stopPropagation();setSelection('line',handle.lineId,handle.nodeId);
  commit(()=>{
    const line=getLine(handle.lineId),edit=beginRoutePointEdit(map,handle.lineId,handle,{nodeId:handle.nodeId,insertIndex:handle.insertIndex,routing:effectiveLine(map,line).routing,createId:()=>id('bend')});
    if(!edit)return;
    const step=e.shiftKey?1:snapGrid?20:5;
    if(direction)moveRoutePoint(map,edit,{x:direction.x*step,y:direction.y*step},e.shiftKey?0:snapGrid?20:0);
    activeRoutePointId=edit.nodeId;
  });
  requestAnimationFrame(()=>$(`[data-route-node="${CSS.escape(activeRoutePointId||'')}"]`)?.focus());
});
canvas.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const node=e.target.closest('[data-node-id]');if(node){e.preventDefault();setSelection('node',node.dataset.nodeId,null,e.shiftKey&&!presenting);}}});

document.addEventListener('click',e=>{
  if(presenting){if(e.target.closest('[data-action="close-story"]'))setSelection(null);return;}
  const continuation=e.target.closest('[data-continue-line]');
  if(continuation)continueFromEndpoint(continuation.dataset.continueLine,continuation.dataset.continueNode);
  const select=e.target.closest('[data-select-line]');if(select&&!e.target.closest('[data-toggle-line]'))setSelection('line',select.dataset.selectLine,null,e.shiftKey&&!presenting);
  const toggle=e.target.closest('[data-toggle-line]');if(toggle)commit(()=>{const l=getLine(toggle.dataset.toggleLine);l.visible=!l.visible;});
  const toolButton=e.target.closest('[data-tool]');if(toolButton&&toolButton!==canvas){const t=toolButton.dataset.tool;if(t==='line'){if(!drawing)createLine();}else setTool(t);}
  const theme=e.target.closest('[data-theme]');if(theme)commit(()=>map.theme=theme.dataset.theme);
  const paletteButton=e.target.closest('[data-palette-field]');if(paletteButton)openColorPalette(paletteButton);
  const paletteColor=e.target.closest('[data-palette-color]');if(paletteColor)choosePaletteColor(paletteColor.dataset.paletteColor);
  if(!paletteButton&&!e.target.closest('#color-popover'))closeColorPalette();
  const shape=e.target.closest('[data-symbol]');
  const batchShape=e.target.closest('[data-batch-symbol]');
  if(batchShape&&selection?.type==='multi')commit(()=>applyBatchStyle(map,selection,'node','symbol',batchShape.dataset.batchSymbol));
  if(shape&&selectedNode())commit(()=>{const n=selectedNode();if(n.symbol!==shape.dataset.symbol&&shape.dataset.symbol==='cross'&&n.symbolCrossMode!=='manual')n.symbolAngle=0;n.symbol=shape.dataset.symbol;});
  const radiusPreset=e.target.closest('[data-corner-radius]');
  if(radiusPreset&&selectedLine())commit(()=>{makeLineCustom(selectedLine());selectedLine().cornerRadius=Number(radiusPreset.dataset.cornerRadius);});
  if(radiusPreset&&selection?.type==='multi')commit(()=>applyBatchStyle(map,selection,'line','cornerRadius',Number(radiusPreset.dataset.cornerRadius)));
  const rotation=e.target.closest('[data-symbol-angle]');
  if(rotation&&selectedNode())commit(()=>selectedNode().symbolAngle=Number(rotation.dataset.symbolAngle));
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='close-selection')setSelection(null);
  if(action==='extend-line'){const line=selectedLine();if(line?.nodeIds.length)continueFromEndpoint(line.id,line.nodeIds.at(-1));else if(line){activeLineId=line.id;drawingEnd='end';drawing=true;setTool('line');renderInspector();}}
  if(action==='delete')removeSelection();
  if(action==='remove-route-point')removeActiveRoutePoint();
  if(action==='customize-cross')commit(()=>{const n=selectedNode();n.symbolCrossArms=resolveCrossArms(effectiveNode(map,n),stationDirections(map,n.id));n.symbolCrossMode='manual';});
  if(action==='follow-cross')commit(()=>{selectedNode().symbolCrossMode='auto';selectedNode().symbolAngle=0;});
  if(action==='add-cross-arm')commit(()=>{
    const n=selectedNode(),arms=normalizeCrossArms(n.symbolCrossArms),angles=arms.map(a=>(a.angle+360)%360).sort((a,b)=>a-b);
    let gap=0,angle=0;
    angles.forEach((a,i)=>{const next=angles[(i+1)%angles.length]+(i===angles.length-1?360:0);if(next-a>gap){gap=next-a;angle=(a+gap/2)%360;}});
    if(arms.length<8){arms.push({angle:angle>=180?angle-360:angle,length:normalizeSymbol(effectiveNode(map,n)).length/2+4});n.symbolCrossArms=normalizeCrossArms(arms);n.symbolCrossMode='manual';}
  });
  const removeArm=e.target.closest('[data-remove-arm]');
  if(removeArm&&selectedNode())commit(()=>{const n=selectedNode(),arms=normalizeCrossArms(n.symbolCrossArms);if(arms.length>2){arms.splice(Number(removeArm.dataset.removeArm),1);n.symbolCrossArms=normalizeCrossArms(arms);}});
  if(action==='toggle-bend')commit(()=>{const n=selectedNode();n.kind=n.kind==='bend'?'station':'bend';});
  if(action==='close-modal')$('#modal').close();
  if(action==='reset-label-position')commit(()=>{if(selection?.type==='multi'){applyBatchStyle(map,selection,'node','labelOffsetX',0);applyBatchStyle(map,selection,'node','labelOffsetY',0);}else if(selectedNode()){selectedNode().labelOffsetX=0;selectedNode().labelOffsetY=0;}});
  const resetTextColor=e.target.closest('[data-reset-text-color]');
  if(resetTextColor)commit(()=>{const key=resetTextColor.dataset.resetLabelColor||'labelColor';if(resetTextColor.dataset.resetTextColor==='default')map.defaults=normalizeDefaults({...map.defaults,[key]:'auto'});else if(resetTextColor.dataset.resetTextColor==='batch-node')applyBatchStyle(map,selection,'node',key,'auto');else if(selectedNode()){makeTextCustom(selectedNode());selectedNode()[key]='auto';}});
  if(action==='all-text-global')commit(()=>map.nodes.forEach(n=>n.labelStyleMode='global'));
  const textPreset=e.target.closest('[data-text-preset]');
  if(textPreset)commit(()=>{
    const diagonal=textPreset.dataset.textPreset==='diagonal';
    const values={labelAngle:diagonal?-45:0,labelAnchor:diagonal?'start':'auto',labelFromStop:diagonal,labelGap:diagonal?10:15};
    if(textPreset.dataset.textScope==='default')map.defaults=normalizeDefaults({...map.defaults,...values});
    else if(textPreset.dataset.textScope==='batch-node')Object.entries({...values,labelOffsetX:0,labelOffsetY:0}).forEach(([key,value])=>applyBatchStyle(map,selection,'node',key,value));
    else if(selectedNode()){makeTextCustom(selectedNode());Object.assign(selectedNode(),values,{labelOffsetX:0,labelOffsetY:0});}
  });
  if(action==='all-lines-global')commit(()=>map.lines.forEach(l=>l.styleMode='global'));
  if(action==='all-crosses-global')commit(()=>map.nodes.filter(n=>n.symbol==='cross').forEach(n=>n.crossStyleMode='global'));
  if(action==='import')void openProjectJSON();
  if(action==='save-project')void saveProject();
  if(action==='save-project-as')void saveProjectAs();
  if(action==='resume-file')void projectAutosave.resume();
  if(action==='disconnect-file'){disconnectProjectFile();updateProjectFileStatus({state:'browser'});}
  if(action==='download-json')downloadJSON();
  if(action==='export-json')exportJSON();
  if(action==='export-svg')exportSVG();
  const template=e.target.closest('[data-template]');if(template)loadTemplate(template.dataset.template);
  const presentNode=e.target.closest('[data-present-node]');if(presentNode)setSelection('node',presentNode.dataset.presentNode);
});
let editingField=null;
document.addEventListener('focusin',e=>{if(e.target.matches('[data-map-field],[data-node-field],[data-line-field],[data-cross-field],[data-default-field],[data-batch-node-field],[data-batch-line-field]'))editingField={target:e.target,changed:false};});
function editMapField(e) {
  const target=e.target,key=target.dataset.mapField;
  if(!['title','subtitle'].includes(key))return;
  const text=target.value.slice(0,key==='title'?100:200);
  const value=key==='title'?text.trim()||'Untitled map':e.type==='change'?text.trim():text;
  if(map[key]!==value) {
    if(!editingField||editingField.target!==target)editingField={target,changed:false};
    if(!editingField.changed){snapshot();editingField.changed=true;}
    map[key]=value;save();render(false);
  }
  if(e.type==='change'){target.value=map[key];editingField=null;}
}
document.addEventListener('focusout',e=>{if(e.target.dataset.mapField)editMapField({target:e.target,type:'change'});});
function editCrossArm(e) {
  const target=e.target,n=selectedNode(),index=Number(target.dataset.crossIndex),key=target.dataset.crossField;
  if(!n||n.symbol!=='cross'||n.symbolCrossMode!=='manual'||target.value===''||!target.validity.valid)return;
  const arms=normalizeCrossArms(n.symbolCrossArms),value=Number(target.value);
  if(!arms[index]||arms[index][key]===value)return;
  if(!editingField||editingField.target!==target)editingField={target,changed:false};
  if(!editingField.changed){snapshot();editingField.changed=true;}
  arms[index][key]=value;n.symbolCrossArms=normalizeCrossArms(arms);save();render(false);
}
function editDefaultField(e) {
  const target=e.target,key=target.dataset.defaultField;
  if(target.type==='number'&&(target.value===''||!target.validity.valid))return;
  if((/Color$/.test(key)||key==='color')&&!/^#[0-9a-fA-F]{6}$/.test(target.value))return;
  const numeric=['cornerRadius','width','crossSize','crossLength','crossWidth','labelPadding','labelBorderWidth','labelFontSize','labelWeight','labelAngle','labelGap'].includes(key),value=key==='labelFromStop'?target.value==='true':numeric?Number(target.value):target.value;
  const current=normalizeDefaults(map.defaults);if(current[key]===value&&!((key==='crossOutlineColor'&&current.crossOutline!=='custom')||(key==='crossFillColor'&&current.crossFill!=='custom')))return;
  if(!editingField||editingField.target!==target)editingField={target,changed:false};
  if(!editingField.changed){snapshot();editingField.changed=true;}
  const changes={[key]:value};
  if(key==='crossOutlineColor')changes.crossOutline='custom';
  if(key==='crossFillColor')changes.crossFill='custom';
  map.defaults=normalizeDefaults({...current,...changes});save();render();
  $$('#modal [data-value-for]').filter(el=>el.dataset.valueFor===key).forEach(el=>el.textContent=formatControlValue(key,map.defaults[key]));
}
function editBatchField(target) {
  const type=target.dataset.batchNodeField?'node':'line',key=target.dataset.batchNodeField||target.dataset.batchLineField;
  if(selection?.type!=='multi'||target.value===''||!target.validity.valid)return;
  if((/Color$/.test(key)||key==='color')&&!/^#[0-9a-f]{6}$/i.test(target.value))return;
  const numeric=['labelPadding','labelBorderWidth','labelFontSize','labelWeight','labelGap','labelOffsetX','labelOffsetY','labelAngle','width','cornerRadius','symbolAngle','symbolSize','symbolLength','symbolArmWidth'].includes(key);
  const value=key==='labelFromStop'?target.value==='true':numeric?Number(target.value):target.value;
  const state=batchStyleValue(map,selection,type,key);
  const force=(key==='symbolOutlineColor'||key==='symbolFillColor')&&selectedRecords(map,selection,'node').some(n=>effectiveNode(map,n)[key==='symbolOutlineColor'?'symbolOutline':'symbolFill']!=='custom');
  if(!state.mixed&&state.value===value&&!force)return;
  if(!editingField||editingField.target!==target)editingField={target,changed:false};
  if(!editingField.changed){snapshot();editingField.changed=true;}
  applyBatchStyle(map,selection,type,key,value);save();
  render(['symbolOutline','symbolFill','labelPosition','labelShape'].includes(key));syncBatchControls();
}
function editField(e){
  if(presenting)return;
  if(e.target.dataset.mapField){editMapField(e);return;}
  if(e.target.dataset.batchNodeField||e.target.dataset.batchLineField){editBatchField(e.target);return;}
  if(e.target.dataset.defaultField){editDefaultField(e);return;}
  if(e.target.dataset.crossField){editCrossArm(e);return;}
  const target=e.target, nodeKey=target.dataset.nodeField, lineKey=target.dataset.lineField;
  const record=nodeKey?selectedNode():lineKey?selectedLine():null,key=nodeKey||lineKey;
  if(!record)return;
  if(target.type==='number'&&(target.value===''||!target.validity.valid))return;
  if((/Color$/.test(key)||key==='color')&&!/^#[0-9a-fA-F]{6}$/.test(target.value))return;
  const value=key==='labelFromStop'?target.value==='true':['labelPadding','labelBorderWidth','labelFontSize','labelWeight','labelGap','labelOffsetX','labelOffsetY','labelAngle','width','cornerRadius','symbolAngle','symbolSize','symbolLength','symbolArmWidth'].includes(key)?Number(target.value):target.value;
  const localLine=lineKey&&lineVisualKeys.includes(key),localCross=nodeKey&&record.symbol==='cross'&&crossVisualKeys.includes(key);
  const localText=nodeKey&&textStyleKeys.includes(key);
  const current=localText?effectiveLabel(map,record):localLine?effectiveLine(map,record):localCross?effectiveNode(map,record):record;
  if(current[key]===value&&!((key==='symbolOutlineColor'&&current.symbolOutline!=='custom')||(key==='symbolFillColor'&&current.symbolFill!=='custom')))return;
  if(!editingField||editingField.target!==target)editingField={target,changed:false};
  if(!editingField.changed){snapshot();editingField.changed=true;}
  if(localText)makeTextCustom(record);
  if(localLine)makeLineCustom(record);
  if(localCross)makeCrossCustom(record);
  if(key==='symbolCrossMode'&&value==='manual')record.symbolCrossArms=resolveCrossArms(effectiveNode(map,record),stationDirections(map,record.id));
  if(key==='labelPosition'&&effectiveLabel(map,record).labelFromStop){makeTextCustom(record);record.labelFromStop=false;}
  if(key==='symbolOutlineColor'){record.symbolOutline='custom';const source=$('[data-node-field="symbolOutline"]');if(source)source.value='custom';}
  if(key==='symbolFillColor'){record.symbolFill='custom';const source=$('[data-node-field="symbolFill"]');if(source)source.value='custom';}
  record[key]=value;save();render(['symbolCrossMode','labelPosition','symbolOutline','symbolFill','labelShape'].includes(key));
  if(key==='description'&&$('#description-preview'))$('#description-preview').innerHTML=renderDescription(value)||'<p class="story-empty">No description yet.</p>';
  $$('[data-node-field]').filter(el=>el!==target&&el.dataset.nodeField===key).forEach(el=>el.value=value);
  $$('[data-value-for]').filter(el=>el.dataset.valueFor===key).forEach(el=>el.textContent=formatControlValue(key,value));
  const preview=$(`[data-paint-preview="${nodeKey?'node':'line'}-${key}"]`);if(preview)preview.style.setProperty('--paint-color',value);
  if(localText&&$('#inherit-text'))$('#inherit-text').checked=false;
  if(localText)syncLabelPaintControls('node',effectiveLabel(map,record));
  $$('[data-reset-text-color="node"]').filter(el=>el.dataset.resetLabelColor===key).forEach(el=>{el.classList.remove('active');el.setAttribute('aria-pressed','false');});
  if(localLine&&$('#inherit-line')){$('#inherit-line').checked=false;$('#line-style-status').textContent='Custom style for this line.';}
  if(localCross&&$('#inherit-cross')){$('#inherit-cross').checked=false;$('#cross-style-status').textContent='Custom appearance for this cross.';}
  if(key==='cornerRadius')$$('[data-corner-radius]').forEach(el=>el.classList.toggle('active',Number(el.dataset.cornerRadius)===value));
  if(key==='symbolAngle')$$('[data-symbol-angle]').forEach(el=>el.classList.toggle('active',Number(el.dataset.symbolAngle)===value));
}
document.addEventListener('input',editField);
document.addEventListener('change',editField);
document.addEventListener('change',e=>{
  if(e.target.matches('[data-batch-node-field],[data-batch-line-field]'))editingField=null;
  if(e.target.id==='batch-inherit-line')commit(()=>applyBatchStyle(map,selection,'line','styleMode',e.target.checked?'global':'custom'));
  if(e.target.id==='batch-inherit-text')commit(()=>applyBatchStyle(map,selection,'node','labelStyleMode',e.target.checked?'global':'custom'));
  if(e.target.id==='inherit-line'&&selectedLine())commit(()=>{if(e.target.checked)selectedLine().styleMode='global';else makeLineCustom(selectedLine());});
  if(e.target.id==='inherit-text'&&selectedNode())commit(()=>{if(e.target.checked)selectedNode().labelStyleMode='global';else makeTextCustom(selectedNode());});
  if(e.target.id==='inherit-cross'&&selectedNode())commit(()=>{if(e.target.checked)selectedNode().crossStyleMode='global';else makeCrossCustom(selectedNode());});
});
$('#map-styles').onclick=openStyleDialog;
$('#line-list').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-select-line]')){e.preventDefault();setSelection('line',e.target.dataset.selectLine,null,e.shiftKey&&!presenting);}});
$('#add-line').onclick=$('#draw-new-line').onclick=createLine;
$('#network-toggle').onclick=()=>togglePanel('left');
$('#properties-toggle').onclick=()=>togglePanel('right');
$('#focus-toggle').onclick=toggleFocus;
layoutQuery.addEventListener('change',syncPanels);
$('#inspector-content').addEventListener('click',e=>{
  const tab=e.target.closest('[data-inspector-tab]');if(!tab)return;
  $$('[data-inspector-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button===tab)));
  $$('[data-inspector-section]').forEach(section=>section.hidden=section.dataset.inspectorSection!==tab.dataset.inspectorTab);
});
$('#undo').onclick=()=>history('undo');$('#redo').onclick=()=>history('redo');
$('#fit').onclick=()=>fitMap();
$('#zoom-in').onclick=()=>zoom(.8);$('#zoom-out').onclick=()=>zoom(1.25);$('#zoom-value').onclick=()=>fitMap();
$('#show-grid').onchange=e=>{showGrid=e.target.checked;render(false);};$('#snap-grid').onchange=e=>snapGrid=e.target.checked;
function setPresent(value){
  if(value===presenting)return;
  closeColorPalette();
  const restored=value?null:editingWorkspace;
  if(drag)endDrag();
  if(value) {
    finishLine(false);
    editingWorkspace={panels:clone(panels),view:{...view},fitWidth,selection:clone(selection),activeLineId,activeRoutePointId,tool,viewport:{width:canvas.clientWidth,height:canvas.clientHeight},inspectorTab:$('#inspector-content [data-inspector-tab][aria-pressed="true"]')?.dataset.inspectorTab||'style',inspectorOpen:$$('#inspector-content details[data-inspector-section-key][open]').map(el=>el.dataset.inspectorSectionKey),inspectorScroll:$('#inspector-content').scrollTop};
    panels={left:false,right:false,restore:null};
    if($('#modal').open)$('#modal').close();
  } else if(restored) {panels=restored.panels;editingWorkspace=null;}
  presenting=value;document.body.classList.toggle('presenting',value);
  $('.brand').inert=value;
  selection=value?null:restored?.selection||null;
  activeLineId=value?null:restored?.activeLineId||null;
  activeRoutePointId=value?null:restored?.activeRoutePointId||null;
  spaceDown=false;canvas.style.cursor='';syncPanels();setTool(value?'select':restored?.tool||'select');render();
  if(restored) {
    $$('#inspector-content [data-inspector-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inspectorTab===restored.inspectorTab)));
    $$('#inspector-content [data-inspector-section]').forEach(section=>section.hidden=section.dataset.inspectorSection!==restored.inspectorTab);
    $$('#inspector-content details[data-inspector-section-key]').forEach(section=>section.open=restored.inspectorOpen.includes(section.dataset.inspectorSectionKey));
    $('#inspector-content').scrollTop=restored.inspectorScroll;
  }
  if(value)canvas.focus({preventScroll:true});else $('#focus-toggle').focus({preventScroll:true});
  requestAnimationFrame(()=>{
    if(value!==presenting)return;
    lastCanvasSize={width:canvas.clientWidth,height:canvas.clientHeight};
    if(value)fitMap(false);
    else if(restored) {
      const scale=restored.view.width/Math.max(1,restored.viewport.width);
      const width=lastCanvasSize.width*scale,height=lastCanvasSize.height*scale;
      fitWidth=restored.fitWidth*lastCanvasSize.width/Math.max(1,restored.viewport.width);
      applyView({x:restored.view.x+(restored.view.width-width)/2,y:restored.view.y+(restored.view.height-height)/2,width,height});
    }
  });
}
$('#present').onclick=toggleFocus;$('#exit-present').onclick=()=>void exitPresentation();

document.addEventListener('keydown',e=>{
  const factor=mapZoomShortcut(e);if(factor===null||e.defaultPrevented)return;
  e.preventDefault();zoom(factor);
},{capture:true});
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented)return;
  if(e.key==='Escape'&&paletteTarget){e.preventDefault();closeColorPalette();return;}
  if(e.target.closest('input,textarea,select,[contenteditable]')||$('#modal').open)return;
  const mod=e.metaKey||e.ctrlKey;
  if(presenting) {
    const key=e.key.toLowerCase();
    if(key==='escape'||key==='\\'){e.preventDefault();void exitPresentation();return;}
    if(key==='delete'||key==='backspace'||mod&&['z','s'].includes(key)){e.preventDefault();return;}
    if(e.code==='Space'&&!e.target.closest('button,a,#station-story')){e.preventDefault();spaceDown=true;canvas.style.cursor='grab';return;}
    if(!mod&&!e.target.closest('#station-story')) {
      if(key==='+'||key==='=')zoom(.8);if(key==='-')zoom(1.25);if(key==='f')fitMap();
    }
    return;
  }
  if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();if(!presenting)history(e.shiftKey?'redo':'undo');return;}
  if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();void saveProject();return;}
  if(e.key==='Escape'&&drag?.type==='label'){e.preventDefault();map=drag.before;drag=null;render();return;}
  if(e.key==='Escape'&&drag?.type==='route-point'){e.preventDefault();cancelRoutePointDrag();return;}
  if(e.key==='Escape'){finishLine(false);setTool('select');setSelection(null);return;}
  if(presenting)return;
  if(e.code==='Space'){if(e.target.closest('button,a,summary'))return;e.preventDefault();spaceDown=true;canvas.style.cursor='grab';return;}
  if(mod)return;
  if(e.key==='\\'){e.preventDefault();toggleFocus();return;}
  if(e.key==='['){e.preventDefault();togglePanel('left');return;}
  if(e.key===']'){e.preventDefault();togglePanel('right');return;}
  const key=e.key.toLowerCase();
  if(key==='v')setTool('select');if(key==='h')setTool('hand');if(key==='s')setTool('stop');if(key==='l'&&!drawing)createLine();if(key==='f')fitMap();
  if(key==='enter'&&drawing)finishLine();
  if(key==='delete'||key==='backspace'){e.preventDefault();if(!removeActiveRoutePoint())removeSelection();}
  if(key==='+'||key==='=')zoom(.8);if(key==='-')zoom(1.25);
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceDown=false;canvas.style.cursor='';}});
window.addEventListener('blur',()=>{spaceDown=false;canvas.style.cursor='';endDrag();});

function openModal(content){closeColorPalette();$('#modal').classList.remove('style-dialog');$('#modal-content').innerHTML=content;$('#modal').showModal();}
function modalHead(title){return `<div class="modal-header"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>`;}
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});
$('#new-map').onclick=()=>openModal(`${modalHead('New map')}<p class="modal-intro">Start fresh or make one of these maps your own. Your current map stays available with Undo. Export JSON to keep a separate copy.</p><div class="template-list">${templates.map(t=>`<button class="template-card" data-template="${t.id}"><span class="template-preview"><svg viewBox="0 0 80 50" fill="none"><path d="M4 30h25L49 10h27" stroke="${t.id==='product'?'#70A8FF':'#4068E8'}" stroke-width="4"/><path d="M15 5v10l30 30h30" stroke="#E89A38" stroke-width="4"/><path d="M40 3v44" stroke="#469B79" stroke-width="4"/><g fill="#f1f4e9" stroke="#526843" stroke-width="2"><circle cx="15" cy="30" r="3"/><circle cx="40" cy="19" r="4"/><circle cx="65" cy="10" r="3"/></g></svg></span><span><small>${esc(t.tag)}</small><br><strong>${esc(t.title)}</strong><p>${esc(t.description)}</p></span></button>`).join('')}</div><div class="modal-footer">Already have a map?<button class="button outlined" data-action="import">${icon('file')} Import JSON</button></div>`);
function loadTemplate(tid){const t=templates.find(t=>t.id===tid);if(!t)return;disconnectProjectFile();commit(()=>{map=validateMap(t.create());selection=null;activeLineId=null;drawing=false;});setTool('select');$('#modal').close();fitMap();notify(tid==='blank'?'A fresh start. Press L to draw your first line.':'Your new map is ready to make your own.');}
$('#rename-map').onclick=()=>{
  if(drawing)finishLine(false);
  setSelection(null);panels.right=true;
  if(!wideLayout())panels.left=false;
  syncPanels();$('#project-title')?.focus();
};
$('#map-details').onclick=()=>$('#rename-map').click();
$('#help').onclick=()=>openModal(`${modalHead('Help & shortcuts')}<p class="modal-intro">Draw a line by clicking to place stops. The route automatically follows metro-style angles. Click an existing stop to connect lines; drag one stop onto another to merge them.</p><div class="shortcut-list">${[['Select & move','V'],['New line','L'],['Insert a stop','S'],['Pan the canvas','H / Space'],['Finish a line','Enter'],['Select multiple items','Shift + click'],['Place a route bend','Shift + click while drawing'],['Fit the whole map','F'],['Zoom the map','Ctrl/Cmd + / −'],['Lines panel','['],['Properties panel',']'],['Present fullscreen','\\'],['Undo / redo','⌘Z / ⌘⇧Z'],['Remove selection','Delete'],['Cancel / exit','Esc']].map(([t,k])=>`<div class="shortcut-item"><span>${t}</span><kbd>${k}</kbd></div>`).join('')}</div><div class="onboard-note">Drag a selected line’s diamond handles, or drag any segment, to reshape the route locally. Double-click a bend to remove it; double-click the route itself to insert a station. Use <strong>Continue this line</strong> to extend a selected route. In presentation mode, clicking a station opens its story. Your map is saved on this browser; export JSON to back it up or continue on another device.</div>`);
$('#export').onclick=()=>openModal(`${modalHead('Export map')}<p class="modal-intro">Take your map with you. Export a crisp vector graphic or save an editable copy of the whole network.</p><div class="export-options"><button class="export-option" data-action="export-svg">${icon('export')}<strong>Export SVG</strong><p>A sharp, scalable map for documents, slides, and print.</p><span class="keycap">VECTOR IMAGE</span></button><button class="export-option" data-action="export-json">${icon('file')}<strong>Save map file</strong><p>Keep all your lines, stops, and stories. Reopen it in Pointwise.</p><span class="keycap">EDITABLE JSON</span></button></div><div class="modal-footer">Bring a saved map back into the studio.<button class="button outlined" data-action="import">Import JSON</button></div>`);
function filename(ext){return `${map.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'pointwise-map'}.${ext}`;}
function download(data,type,name){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function downloadJSON(){download(JSON.stringify(map,null,2),'application/json',filename('json'));notify('JSON copy downloaded.');}
function exportJSON(){if(nativeFileAccess)void saveProjectAs();else{downloadJSON();$('#modal').close();}}
function exportSVG(){
  download(buildSVG(map),'image/svg+xml',filename('svg'));
  notify('Your vector map is ready.');$('#modal').close();
}
function disconnectProjectFile(){fileSessionRevision++;projectAutosave.detach();}
function fileDescription(status={state:projectAutosave.state}) {
  if(!nativeFileAccess)return 'This browser saves a recovery copy locally. Direct JSON autosave requires a browser with file-picker support, such as Chrome or Edge.';
  const messages={browser:'Open a JSON file or use Save as to enable file autosave.',pending:'Changes waiting to save…',saving:'Saving to JSON…',saved:'Autosaving to JSON',permission:'File autosave paused — reconnect to allow writing.',error:projectAutosave.error?.message||'File autosave paused. Your browser recovery copy is still available.'};
  return messages[status.state]||messages.browser;
}
function updateProjectFileStatus(status) {
  const button=$('#project-file');if(!button)return;
  button.title=fileDescription(status);button.dataset.saveState=status.state;
  const description=$('#project-file-description');if(description)description.textContent=fileDescription(status);
  const name=$('#project-file-name');if(name)name.textContent=projectAutosave.handle?.name||'No linked JSON file';
  const resume=$('[data-action="resume-file"]');if(resume)resume.hidden=!projectAutosave.handle||!projectAutosave.paused;
  const detach=$('[data-action="disconnect-file"]');if(detach)detach.hidden=!projectAutosave.handle;
}
$('#project-file').onclick=()=>{
  openModal(`${modalHead('Project file')}<p id="project-file-name" class="project-file-name"></p><p id="project-file-description" class="modal-intro" role="status"></p><div class="project-file-actions"><button class="button outlined" data-action="import">${icon('file')} Open JSON</button><button class="button primary" data-action="save-project" ${nativeFileAccess?'':'hidden'}>Save</button><button class="button outlined" data-action="save-project-as">${nativeFileAccess?'Save as…':'Download JSON'}</button><button class="button outlined" data-action="resume-file" hidden>Reconnect file</button><button class="button quiet" data-action="download-json" ${nativeFileAccess?'':'hidden'}>Download a copy</button><button class="button quiet" data-action="disconnect-file" hidden>Disconnect file</button></div>`);
  updateProjectFileStatus({state:projectAutosave.state||'browser'});
};
const jsonPickerOptions={types:[{description:'Pointwise project',accept:{'application/json':['.json']}}]};
async function readProjectFile(file){
  if(file.size>5*1024*1024)throw new Error('Choose a map file smaller than 5 MB.');
  const text=await file.text();return {text,next:validateMap(JSON.parse(text))};
}
function installProject(next){
  disconnectProjectFile();
  commit(()=>{map=next;selection=null;drawing=false;activeLineId=null;});
  undoStack=[];redoStack=[];setTool('select');render();$('#modal').close();fitMap();
}
async function openProjectJSON(){
  if(!nativeFileAccess){$('#import-file').click();return;}
  try{
    const [handle]=await window.showOpenFilePicker({...jsonPickerOptions,multiple:false});
    const granted=await handle.requestPermission({mode:'readwrite'})==='granted';
    const {text,next}=await readProjectFile(await handle.getFile());
    installProject(next);fileSessionRevision++;
    projectAutosave.attach(handle,{diskText:text,granted});
    notify(granted?'JSON opened. Edits will autosave to this file.':'JSON opened. Reconnect the file to enable autosave.');
  }catch(error){if(error.name!=='AbortError')notify(error instanceof SyntaxError?'This is not a valid JSON map.':error.message);}
}
async function saveProjectAs(){
  if(!nativeFileAccess){downloadJSON();return;}
  try{
    const handle=await window.showSaveFilePicker({...jsonPickerOptions,suggestedName:filename('json')});
    await projectAutosave.flush();
    const text=await (await handle.getFile()).text();
    fileSessionRevision++;
    projectAutosave.attach(handle,{diskText:text,savedText:null,granted:true});
    const success=await projectAutosave.flush();
    if(success){$('#modal').close();notify('Project saved. Edits will autosave to this JSON file.');}
    else notify(fileDescription({state:projectAutosave.state}));
  }catch(error){if(error.name!=='AbortError')notify(error.message);}
}
async function saveProject(){
  save();
  if(!projectAutosave.handle){await saveProjectAs();return;}
  const success=projectAutosave.paused?await projectAutosave.resume():await projectAutosave.flush();
  if(success){notify('JSON file saved.');$('#modal').close();}
  else notify(fileDescription({state:projectAutosave.state}));
}
$('#import-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const {next}=await readProjectFile(file);installProject(next);notify('JSON imported. Changes are saved in this browser; download a copy to update your file.');}
  catch(error){notify(error instanceof SyntaxError?'This is not a valid JSON map.':error.message);}
  e.target.value='';
};
window.addEventListener('beforeunload',e=>{if(projectAutosave.handle&&(projectAutosave.writing||projectAutosave.latest!==projectAutosave.savedText)){void projectAutosave.flush();e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void projectAutosave.flush();});
async function restoreProjectFile(){
  if(!nativeFileAccess){updateProjectFileStatus({state:'browser'});return;}
  if(!loadedSavedMap){rememberProjectFile(null).catch(()=>{});return;}
  const revision=fileSessionRevision;
  try{
    const record=await recallProjectFile();if(!record?.handle||revision!==fileSessionRevision)return;
    const granted=await record.handle.queryPermission({mode:'readwrite'})==='granted';
    if(revision!==fileSessionRevision)return;
    projectAutosave.attach(record.handle,{diskText:record.diskText,savedText:record.savedText,granted});
  }catch{updateProjectFileStatus({state:'browser'});}
}

syncPanels();
let lastCanvasSize={width:canvas.clientWidth,height:canvas.clientHeight};
let resizeTimer;
new ResizeObserver(()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{
    const next={width:canvas.clientWidth,height:canvas.clientHeight};
    if(!next.width||!next.height)return;
    if(lastCanvasSize.width && (next.width!==lastCanvasSize.width||next.height!==lastCanvasSize.height)) {
      const unitsPerPixel=view.width/lastCanvasSize.width;
      const width=next.width*unitsPerPixel,height=next.height*unitsPerPixel;
      fitWidth*=next.width/lastCanvasSize.width;
      applyView({x:view.x+(view.width-width)/2,y:view.y+(view.height-height)/2,width,height});
    }
    lastCanvasSize=next;
  },60);
}).observe(canvasArea);
setTool('select');render();requestAnimationFrame(()=>fitMap(false));save();

if(repairedSnapshot)notify('Removed leftover empty routes. Undo to restore.');

void restoreProjectFile();

$('#color-popover').addEventListener('toggle',e=>{if(e.newState==='closed'){e.target.hidden=true;paletteTarget=null;$$('[data-palette-field]').forEach(button=>button.setAttribute('aria-expanded','false'));}});
document.addEventListener('input',e=>{if(e.target.matches('[data-palette-custom]'))choosePaletteColor(e.target.value,false);});
document.addEventListener('change',e=>{if(e.target.matches('[data-palette-custom]'))closeColorPalette();});
document.addEventListener('scroll',e=>{if(paletteTarget&&!e.target.closest?.('#color-popover'))closeColorPalette();},true);
window.addEventListener('resize',closeColorPalette);
