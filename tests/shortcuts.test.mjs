import test from 'node:test';
import assert from 'node:assert/strict';
import { mapZoomShortcut } from '../dist/shortcuts.js';
test('Ctrl and Cmd plus/equal/minus use exactly the bottom toolbar zoom factors',()=>{
  for(const modifier of ['ctrlKey','metaKey']) {
    for(const key of ['+','=','Add'])assert.equal(mapZoomShortcut({[modifier]:true,key}),.8);
    for(const key of ['-','_','Subtract'])assert.equal(mapZoomShortcut({[modifier]:true,key}),1.25);
    assert.equal(mapZoomShortcut({[modifier]:true,key:'+',shiftKey:true}),.8);
  }
});
test('numeric keypad zoom works even when the browser reports an alternate key',()=>{
  assert.equal(mapZoomShortcut({ctrlKey:true,code:'NumpadAdd',key:'Unidentified'}),.8);
  assert.equal(mapZoomShortcut({metaKey:true,code:'NumpadSubtract',key:'Unidentified'}),1.25);
});
test('typing, AltGr and unrelated shortcuts retain their normal behavior',()=>{
  assert.equal(mapZoomShortcut({key:'+'}),null);
  assert.equal(mapZoomShortcut({ctrlKey:true,altKey:true,key:'+'}),null);
  for(const key of ['0','z','s','ArrowUp'])assert.equal(mapZoomShortcut({ctrlKey:true,key}),null);
});
