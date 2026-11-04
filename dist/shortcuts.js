/** Match the browser zoom chords, including shifted and numeric keypad variants. */
export function mapZoomShortcut(event) {
  if(!(event.ctrlKey||event.metaKey)||event.altKey)return null;
  if(['+','=','Add'].includes(event.key)||event.code==='NumpadAdd')return .8;
  if(['-','_','Subtract'].includes(event.key)||event.code==='NumpadSubtract')return 1.25;
  return null;
}
