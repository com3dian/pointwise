import { symbolExtent } from './symbols.js';

export const TEXT_DEFAULTS = Object.freeze({labelFontSize:24,labelFontFamily:'sans',labelWeight:500,labelAngle:0,labelAnchor:'auto',labelGap:15,labelFromStop:false,labelColor:'auto',labelShape:'plain',labelFillColor:'auto',labelBorderColor:'auto',labelPadding:8,labelBorderWidth:1.5});
const bounded=(v,f,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):f;
const paint=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:'auto';
export function normalizeTextStyle(value={}) {
  return {
    labelColor:paint(value.labelColor),
    labelShape:value.labelShape==='capsule'?'capsule':'plain',
    labelFillColor:paint(value.labelFillColor),
    labelBorderColor:paint(value.labelBorderColor),
    labelPadding:bounded(value.labelPadding,8,0,40),
    labelBorderWidth:bounded(value.labelBorderWidth,1.5,0,8),
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
let labelMeasuringContext;
/** Matching font metrics for the editor and exported capsule rectangles. */
export function labelCapsuleBounds(node,position) {
  const style=normalizeTextStyle(node),size=style.labelFontSize,text=String(node.name||'');
  if(labelMeasuringContext===undefined) {
    try { labelMeasuringContext=globalThis.document?.createElement('canvas').getContext('2d')||null; }
    catch { labelMeasuringContext=null; }
  }
  let width,ascent=size*.8,descent=size*.2,leftOverhang=0,rightOverhang=0;
  if(labelMeasuringContext) {
    labelMeasuringContext.font=`${style.labelWeight} ${size}px ${labelFont(style.labelFontFamily)}`;
    const metrics=labelMeasuringContext.measureText(text);width=metrics.width;
    ascent=metrics.fontBoundingBoxAscent||Math.max(ascent,metrics.actualBoundingBoxAscent||0);
    descent=metrics.fontBoundingBoxDescent||Math.max(descent,metrics.actualBoundingBoxDescent||0);
    leftOverhang=Math.max(0,metrics.actualBoundingBoxLeft||0);
    rightOverhang=Math.max(0,(metrics.actualBoundingBoxRight||0)-width);
  } else {
    width=[...text].reduce((total,c)=>total+size*(style.labelFontFamily==='mono'?.65:/[MW@#%&]/.test(c)?1.05:/[ilIjtfr.,:;'!| ]/.test(c)?.45:/[A-Z0-9]/.test(c)?.85:/[a-z]/.test(c)?.75:1.2),0);
  }
  const pad=style.labelPadding,anchorOffset=position.anchor==='middle'?width/2:position.anchor==='end'?width:0;
  return {x:position.x-anchorOffset-leftOverhang-pad,y:position.y-ascent-pad,width:width+leftOverhang+rightOverhang+pad*2,height:ascent+descent+pad*2};
}
/** The stored offsets are relative to the stop, in unrotated map coordinates. */
export function labelLayout(node,interchange=false,directions=[]) {
  const style=normalizeTextStyle(node),r=symbolExtent(node,interchange,directions);
  const gap=style.labelGap,em=style.labelFontSize/24;
  const padding=style.labelShape==='capsule'?style.labelPadding+style.labelBorderWidth/2:0;
  let x=node.x,y=node.y,anchor='middle';
  if(style.labelFromStop){
    const angle=style.labelAngle*Math.PI/180;
    const sign=style.labelAnchor==='end'?-1:1;
    x+=Math.cos(angle)*(r+gap+padding)*sign;y+=Math.sin(angle)*(r+gap+padding)*sign+6*em;
    anchor=style.labelAnchor==='auto'?'start':style.labelAnchor;
  } else {
    switch(node.labelPosition){
      case 'bottom':y+=Math.max(39*em,r+gap+9*em)+padding;break;
      case 'left':x-=Math.max(25.5,r+gap)+padding;y+=6*em;anchor='end';break;
      case 'right':x+=Math.max(25.5,r+gap)+padding;y+=6*em;anchor='start';break;
      default:y-=Math.max(27*em,r+gap)+padding;
    }
    if(style.labelAnchor!=='auto')anchor=style.labelAnchor;
  }
  return {x:x+bounded(node.labelOffsetX,0,-2000,2000),y:y+bounded(node.labelOffsetY,0,-2000,2000),anchor};
}
export function moveLabelOffset(node,start,delta) {
  node.labelOffsetX=Math.round(bounded(start.x+delta.x,0,-2000,2000)*10)/10;
  node.labelOffsetY=Math.round(bounded(start.y+delta.y,0,-2000,2000)*10)/10;
}
