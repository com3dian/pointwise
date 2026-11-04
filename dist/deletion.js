/** Delete an editor item and clean up route geometry that has lost its stops. */
export function removeMapItem(map,selection) {
  if(!selection||!['node','line'].includes(selection.type))return;
  const affected=new Set();
  const candidates=new Set();
  if(selection.type==='node') {
    if(!map.nodes.some(node=>node.id===selection.id))return;
    map.nodes=map.nodes.filter(node=>node.id!==selection.id);
    map.lines.forEach(line=>{
      if(line.nodeIds.includes(selection.id)) {
        affected.add(line.id);
        line.nodeIds=line.nodeIds.filter(id=>id!==selection.id);
      }
    });
    const byId=new Map(map.nodes.map(node=>[node.id,node]));
    map.lines=map.lines.filter(line=>{
      if(!affected.has(line.id)||line.nodeIds.some(id=>byId.get(id)?.kind!=='bend'&&byId.has(id)))return true;
      line.nodeIds.forEach(id=>candidates.add(id));
      return false;
    });
  } else {
    const line=map.lines.find(line=>line.id===selection.id);if(!line)return;
    line.nodeIds.forEach(id=>candidates.add(id));
    map.lines=map.lines.filter(line=>line.id!==selection.id);
  }
  const referenced=new Set(map.lines.flatMap(line=>line.nodeIds));
  // Preserve interchanges, other routes, and intentionally standalone stations.
  map.nodes=map.nodes.filter(node=>referenced.has(node.id)||(!candidates.has(node.id)&&node.kind!=='bend'));
}

/** Repair saved, non-drawing documents containing invisible or stranded routes. */
export function repairEmptyRoutes(map) {
  const byId=new Map(map.nodes.map(node=>[node.id,node]));
  const beforeLines=map.lines.length,beforeNodes=map.nodes.length;
  map.lines=map.lines.filter(line=>{
    const nodes=line.nodeIds.map(id=>byId.get(id)).filter(Boolean);
    const distinct=new Set(nodes.map(node=>`${node.x},${node.y}`));
    return nodes.some(node=>node.kind!=='bend')&&distinct.size>=2;
  });
  const referenced=new Set(map.lines.flatMap(line=>line.nodeIds));
  map.nodes=map.nodes.filter(node=>node.kind!=='bend'||referenced.has(node.id));
  return map.lines.length!==beforeLines||map.nodes.length!==beforeNodes;
}
