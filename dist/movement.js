import { snapPoint, routePoints, nearestOnLine } from './geometry.js';

const EPSILON = 1e-7;
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const samePoint = (a,b) => distance(a,b)<EPSILON;
const copyPoint = ({x,y}) => ({x,y});

function routeContext(map,lineId) {
  if(!Array.isArray(map?.nodes)||!Array.isArray(map?.lines))return null;
  const line=map.lines.find(item=>item.id===lineId);
  if(!line||!Array.isArray(line.nodeIds))return null;
  const byId=new Map(map.nodes.map(node=>[node.id,node]));
  return {line,nodes:line.nodeIds.map(id=>byId.get(id)),byId};
}

/** Visible editing handles belong to one route, not to its station graph. */
export function routeEditHandles(map,lineId,routing='octilinear') {
  const context=routeContext(map,lineId);
  if(!context||context.nodes.length<2)return [];
  const {line,nodes}=context, handles=[], explicit=new Set();
  const stations=map.nodes.filter(node=>node.kind!=='bend'&&finitePoint(node));
  const bendPoints=nodes.filter(node=>node?.kind==='bend'&&finitePoint(node));
  const atStation=point=>stations.some(station=>samePoint(point,station));
  nodes.forEach((node,index)=>{
    if(node?.kind!=='bend'||!finitePoint(node)||explicit.has(node.id)||atStation(node))return;
    explicit.add(node.id);
    handles.push({id:node.id,...copyPoint(node),insertIndex:Math.max(1,Math.min(index,line.nodeIds.length-1)),kind:'bend',index});
  });
  const virtual=new Map();
  function add(point,insertIndex,kind) {
    if(atStation(point)||bendPoints.some(bend=>samePoint(point,bend)))return;
    // Quantize only the key. Handle locations keep their exact route geometry.
    const key=`${insertIndex}:${point.x.toFixed(6)},${point.y.toFixed(6)}`;
    const prior=virtual.get(key);
    if(!prior||kind==='corner')virtual.set(key,{...copyPoint(point),insertIndex,kind});
  }
  for(let index=1;index<nodes.length;index+=1) {
    if(!finitePoint(nodes[index-1])||!finitePoint(nodes[index]))continue;
    const points=routePoints([nodes[index-1],nodes[index]],routing);
    points.slice(1,-1).forEach(point=>add(point,index,'corner'));
    for(let leg=1;leg<points.length;leg+=1) {
      const a=points[leg-1],b=points[leg];
      if(distance(a,b)<24)continue;
      add({x:(a.x+b.x)/2,y:(a.y+b.y)/2},index,'segment');
    }
  }
  return handles.concat([...virtual.values()]);
}

function freshId(map,createId) {
  const result=typeof createId==='function'?createId():`bend-${globalThis.crypto.randomUUID()}`;
  return typeof result==='string'&&result.length&&!map.nodes.some(node=>node.id===result)?result:null;
}

function reuseBend(map,context,node,createId) {
  const shared=map.lines.some(line=>line!==context.line&&Array.isArray(line.nodeIds)&&line.nodeIds.includes(node.id));
  if(!shared)return {nodeId:node.id,lineId:context.line.id,created:false,start:copyPoint(node)};
  const id=freshId(map,createId);if(!id)return null;
  const copy={...node,id};
  if(Array.isArray(node.symbolCrossArms))copy.symbolCrossArms=node.symbolCrossArms.map(arm=>({...arm}));
  map.nodes.push(copy);
  context.line.nodeIds=context.line.nodeIds.map(nodeId=>nodeId===node.id?id:nodeId);
  return {nodeId:id,lineId:context.line.id,created:true,start:copyPoint(copy)};
}

/**
 * Start one local edit. Existing stations and their connections are untouched.
 * Passing a handle's insertIndex preserves the intended segment at crossings.
 */
export function beginRoutePointEdit(map,lineId,point,{routing='octilinear',nodeId=null,insertIndex=null,tolerance=0,createId}={}) {
  const context=routeContext(map,lineId);
  if(!context||!finitePoint(point)||context.nodes.length<2||context.nodes.some(node=>!finitePoint(node)))return null;
  const {line,nodes}=context;
  if(nodeId!==null) {
    const node=context.byId.get(nodeId);
    if(!node||node.kind!=='bend'||!line.nodeIds.includes(nodeId))return null;
    return reuseBend(map,context,node,createId);
  }
  if(insertIndex!==null&&(!Number.isInteger(insertIndex)||insertIndex<1||insertIndex>=nodes.length))return null;
  if(Number.isFinite(tolerance)&&tolerance>0) {
    const nearby=nodes.map((node,index)=>({node,index,distance:distance(node,point)}))
      .filter(item=>item.node.kind==='bend'&&item.distance<=tolerance&&(insertIndex===null||item.index===insertIndex||item.index===insertIndex-1))
      .sort((a,b)=>a.distance-b.distance)[0];
    if(nearby)return reuseBend(map,context,nearby.node,createId);
  }
  let location,index;
  if(insertIndex!==null) {
    location=copyPoint(point);index=insertIndex;
  } else {
    // Exclude zero-length pairs so repeated coincident stops cannot steal a
    // closest-point tie from the real routed leg beside them.
    let nearest=null;
    for(let i=1;i<nodes.length;i+=1) {
      if(samePoint(nodes[i-1],nodes[i]))continue;
      const candidate=nearestOnLine(point,[nodes[i-1],nodes[i]],routing);
      if(!nearest||candidate.distance<nearest.distance)nearest={...candidate,insertIndex:i};
    }
    if(!nearest||!Number.isFinite(nearest.distance))return null;
    location={x:nearest.x,y:nearest.y};index=nearest.insertIndex;
  }
  const id=freshId(map,createId);if(!id)return null;
  const bend={id,...location,name:'Route bend',description:'',url:'',kind:'bend',labelPosition:'top',labelAngle:0,symbol:'auto',symbolAngle:0,symbolSize:1,symbolLength:28,symbolOutline:'ink',symbolFill:'paper',crossStyleMode:'global'};
  map.nodes.push(bend);line.nodeIds.splice(index,0,id);
  return {nodeId:id,lineId:line.id,created:true,start:copyPoint(bend)};
}

/** Move just the edited route control point, always relative to its origin. */
export function moveRoutePoint(map,edit,delta,grid=0) {
  if(!edit||!finitePoint(edit.start)||!finitePoint(delta))return false;
  const context=routeContext(map,edit.lineId),node=context?.byId.get(edit.nodeId);
  if(!context||!node||node.kind!=='bend'||!context.line.nodeIds.includes(node.id))return false;
  const point=snapPoint({x:edit.start.x+delta.x,y:edit.start.y+delta.y},grid);
  node.x=point.x;node.y=point.y;
  return !samePoint(node,edit.start);
}
