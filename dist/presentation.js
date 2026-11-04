/** Prefer a card above the station, flipping below only when needed to fit. */
export function stationStoryPosition(anchor,card,viewport) {
  const margin=12,gap=(anchor.radius||0)+14;
  const above=anchor.y-gap-card.height,below=anchor.y+gap;
  const fitsAbove=above>=margin,fitsBelow=below+card.height<=viewport.height-margin;
  const placement=fitsAbove||!fitsBelow&&anchor.y>viewport.height/2?'above':'below';
  const clamp=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));
  const left=clamp(anchor.x-card.width/2,margin,viewport.width-card.width-margin);
  return {left,top:clamp(placement==='above'?above:below,margin,viewport.height-card.height-margin),placement,arrow:clamp(anchor.x-left,20,card.width-20)};
}
