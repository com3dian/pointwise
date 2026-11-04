import { symbolExtent } from './symbols.js';

export const TEXT_DEFAULTS = Object.freeze({labelFontSize:24,labelFontFamily:'sans',labelWeight:500,labelAngle:0,labelAnchor:'auto',labelGap:15,labelFromStop:false,labelColor:'auto'});
const bounded=(v,f,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):f;
export function normalizeTextStyle(value={}) {
  return {
    labelColor:typeof value.labelColor==='string'&&/^#[0-9a-f]{6}$/i.test(value.labelColor)?value.labelColor:'auto',
    labelFontSize:bounded(value.labelFontSize,24,10,96),
    labelFontFamily:['sans','serif','mono'].includes(value.labelFontFamily)?value.labelFontFamily:'sans',
    labelWeight:[400,500,600,700].includes(value.labelWeight)?value.labelWeight:500,
    labelAngle:bounded(value.labelAngle,0,-180,180),
    labelAnchor:['auto','start','middle','end'].includes(value.labelAnchor)?value.labelAnchor:'auto',
    labelGap:bounded(value.labelGap,15,0,160),
    labelFromStop:value.labelFromStop===true,
  };
}
export function labelUsesDefaults(node) {
  return node.labelStyleMode==='global'||(node.labelStyleMode!=='custom'&&!(Number.isFinite(node.labelAngle)&&node.labelAngle!==0));
}
export function effectiveLabel(map,node) {
  return {...node,...normalizeTextStyle(labelUsesDefaults(node)?map?.defaults||{}:node),
    labelPosition:['top','right','bottom','left'].includes(node.labelPosition)?node.labelPosition:'top',
    labelOffsetX:bounded(node.labelOffsetX,0,-2000,2000),labelOffsetY:bounded(node.labelOffsetY,0,-2000,2000)};
}
export function labelFont(family) {
  return family==='serif'?'Georgia, serif':family==='mono'?'Courier New, monospace':'Arial, sans-serif';
}
/** The stored offsets are relative to the stop, in unrotated map coordinates. */
export function labelLayout(node,interchange=false,directions=[]) {
  const style=normalizeTextStyle(node),r=symbolExtent(node,interchange,directions);
  const gap=style.labelGap,em=style.labelFontSize/24;
  let x=node.x,y=node.y,anchor='middle';
  if(style.labelFromStop){
    const angle=style.labelAngle*Math.PI/180;
    const sign=style.labelAnchor==='end'?-1:1;
    x+=Math.cos(angle)*(r+gap)*sign;y+=Math.sin(angle)*(r+gap)*sign+6*em;
    anchor=style.labelAnchor==='auto'?'start':style.labelAnchor;
  } else {
    switch(node.labelPosition){
      case 'bottom':y+=Math.max(39*em,r+gap+9*em);break;
      case 'left':x-=Math.max(25.5,r+gap);y+=6*em;anchor='end';break;
      case 'right':x+=Math.max(25.5,r+gap);y+=6*em;anchor='start';break;
      default:y-=Math.max(27*em,r+gap);
    }
    if(style.labelAnchor!=='auto')anchor=style.labelAnchor;
  }
  return {x:x+bounded(node.labelOffsetX,0,-2000,2000),y:y+bounded(node.labelOffsetY,0,-2000,2000),anchor};
}
export function moveLabelOffset(node,start,delta) {
  node.labelOffsetX=Math.round(bounded(start.x+delta.x,0,-2000,2000)*10)/10;
  node.labelOffsetY=Math.round(bounded(start.y+delta.y,0,-2000,2000)*10)/10;
}
