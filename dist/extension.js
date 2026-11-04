/** Keep route order intact when extending from either end. Closed loops have no endpoint. */
export function lineEndpoint(line,nodeId) {
  const ids=line?.nodeIds||[];
  if(!ids.length||(ids.length>1&&ids[0]===ids.at(-1)))return null;
  if(ids.at(-1)===nodeId)return 'end';
  if(ids[0]===nodeId)return 'start';
  return null;
}
export function extensionAnchor(line,side='end') {
  return side==='start'?line?.nodeIds?.[0]:line?.nodeIds?.at(-1);
}
export function appendRouteStop(line,nodeId,side='end') {
  if(!line||!Array.isArray(line.nodeIds)||!nodeId||extensionAnchor(line,side)===nodeId)return false;
  if(side==='start')line.nodeIds.unshift(nodeId);else line.nodeIds.push(nodeId);
  return true;
}
