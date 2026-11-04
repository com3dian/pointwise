import { effectiveLine, effectiveNode } from './styles.js';
import { effectiveLabel, normalizeTextStyle, labelUsesDefaults } from './labels.js';

const textKeys = Object.keys(normalizeTextStyle());
const lineKeys = ['color','width','style','routing','cornerStyle','cornerRadius','styleMode'];
const symbolKeys = ['symbol','symbolAngle','symbolSize','symbolLength','symbolOutline','symbolOutlineColor','symbolFill','symbolFillColor','symbolCornerStyle','symbolArmWidth','crossStyleMode'];
const nodeKeys = [...textKeys,...symbolKeys,'labelStyleMode','labelPosition','labelOffsetX','labelOffsetY'];

export function selectionItems(selection) {
  return selection?.type==='multi' ? selection.items : selection ? [selection] : [];
}
export function selectionKey(selection) {
  return JSON.stringify(selectionItems(selection).map(({type,id})=>[type,id]).sort());
}
export function isSelected(selection,type,id) {
  return selectionItems(selection).some(item=>item.type===type&&item.id===id);
}
export function toggleSelection(selection,item) {
  const items=selectionItems(selection);
  const next=isSelected(selection,item.type,item.id)
    ? items.filter(other=>other.type!==item.type||other.id!==item.id) : [...items,item];
  return next.length>1?{type:'multi',items:next}:next[0]||null;
}
export function selectedRecords(map,selection,type) {
  const ids=new Set(selectionItems(selection).filter(item=>item.type===type).map(item=>item.id));
  return (type==='node'?map.nodes:map.lines).filter(record=>ids.has(record.id));
}
export function batchStyleValue(map,selection,type,key) {
  const values=selectedRecords(map,selection,type).map(record=>{
    if(type==='line')return effectiveLine(map,record)[key];
    if(key==='labelStyleMode')return labelUsesDefaults(record)?'global':'custom';
    return (textKeys.includes(key)||['labelPosition','labelOffsetX','labelOffsetY'].includes(key)
      ? effectiveLabel(map,record) : effectiveNode(map,record))[key];
  });
  return {value:values[0],mixed:values.some(value=>value!==values[0])};
}
/** Apply just the edited property; freeze inherited styles before creating overrides. */
export function applyBatchStyle(map,selection,type,key,value) {
  if(!(type==='line'?lineKeys:nodeKeys).includes(key))return false;
  let changed=false;
  for(const record of selectedRecords(map,selection,type)) {
    if(key==='crossStyleMode'&&record.symbol!=='cross')continue;
    const current=batchStyleValue(map,{type,id:record.id},type,key).value;
    const force=key==='symbolOutlineColor'&&effectiveNode(map,record).symbolOutline!=='custom'
      ||key==='symbolFillColor'&&effectiveNode(map,record).symbolFill!=='custom';
    if(current===value&&!force)continue;
    if(type==='line'&&key!=='color'&&!(key==='styleMode'&&value==='global'))
      Object.assign(record,effectiveLine(map,record),{styleMode:'custom'});
    if(type==='node') {
      if(textKeys.includes(key)||key==='labelStyleMode'&&value==='custom')
        Object.assign(record,normalizeTextStyle(effectiveLabel(map,record)),{labelStyleMode:'custom'});
      if(record.symbol==='cross'&&symbolKeys.includes(key)&&key!=='symbolAngle'&&!(key==='crossStyleMode'&&value==='global'))
        Object.assign(record,effectiveNode(map,record),{crossStyleMode:'custom'});
      if(key==='symbol'&&value==='cross'&&record.symbol!=='cross') {
        if(record.symbolCrossMode!=='manual')record.symbolAngle=0;
      }
      if(key==='labelPosition'&&effectiveLabel(map,record).labelFromStop) {
        Object.assign(record,normalizeTextStyle(effectiveLabel(map,record)),{labelStyleMode:'custom',labelFromStop:false});
      }
      if(key==='symbolOutlineColor')record.symbolOutline='custom';
      if(key==='symbolFillColor')record.symbolFill='custom';
    }
    record[key]=value;changed=true;
  }
  return changed;
}
