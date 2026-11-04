import test from 'node:test';
import assert from 'node:assert/strict';
import {JSONFileAutosave} from '../dist/project-file.js';
function harness(t){
 let disk='original',text='original',permission='granted',failure=false,gate=null,active=0,peak=0,requests=0,aborted=0;
 const writes=[],states=[],records=[];
 const handle={name:'map.json',queryPermission:async()=>permission,requestPermission:async()=>{requests++;return permission;},getFile:async()=>({text:async()=>disk}),createWritable:async()=>{
  active++;peak=Math.max(peak,active);let staged;
  return {write:async value=>{if(gate)await gate;if(failure)throw Error('Disk full');staged=value;writes.push(value);},close:async()=>{disk=staged;active--;},abort:async()=>{aborted++;active--;}};
 }};
 const session=new JSONFileAutosave({getText:()=>text,onStatus:s=>states.push(s),onRecord:r=>records.push(r),delay:60000});
 t.after(()=>session.detach());
 session.attach(handle,{diskText:disk,granted:true});
 return {session,handle,writes,states,records,setText:v=>text=v,setDisk:v=>disk=v,setPermission:v=>permission=v,setFailure:v=>failure=v,setGate:v=>gate=v,get disk(){return disk;},get peak(){return peak;},get requests(){return requests;},get aborted(){return aborted;}};
}
test('autosave coalesces edits and writes only the latest complete JSON',async t=>{
 const h=harness(t);h.setText('first');h.session.queue();h.setText('latest');h.session.queue();
 assert.equal(await h.session.flush(),true);assert.deepEqual(h.writes,['latest']);assert.equal(h.disk,'latest');assert.equal(h.session.state,'saved');
 await h.session.flush();assert.equal(h.writes.length,1);
});
test('writes serialize and edits arriving during a save finish on disk afterward',async t=>{
 const h=harness(t);let release;h.setGate(new Promise(resolve=>release=resolve));
 h.setText('first');h.session.queue();const first=h.session.flush();
 while(!h.session.writing)await new Promise(resolve=>setTimeout(resolve,0));
 h.setText('second');h.session.queue();const second=h.session.flush();release();
 await Promise.all([first,second]);assert.equal(h.peak,1);assert.equal(h.disk,'second');assert.equal(h.session.savedText,'second');
});
test('undo during an in-flight save writes the restored document after that save',async t=>{
 const h=harness(t);let release;h.setGate(new Promise(resolve=>release=resolve));
 h.setText('edit');h.session.queue();const first=h.session.flush();
 while(!h.session.writing)await new Promise(resolve=>setTimeout(resolve,0));
 h.setText('original');h.session.queue();const second=h.session.flush();release();await Promise.all([first,second]);
 assert.deepEqual(h.writes,['edit','original']);assert.equal(h.disk,'original');assert.equal(h.session.writing,false);
});
test('background saves never request permissions, and reconnect explicitly resumes pending edits',async t=>{
 const h=harness(t);h.setPermission('prompt');h.setText('unsaved');h.session.queue();
 assert.equal(await h.session.flush(),false);assert.equal(h.session.state,'permission');assert.equal(h.requests,0);assert.equal(h.disk,'original');
 h.setPermission('granted');assert.equal(await h.session.resume(),true);assert.equal(h.requests,1);assert.equal(h.disk,'unsaved');
});
test('an external edit pauses autosave instead of overwriting the external file',async t=>{
 const h=harness(t);h.setText('local edit');h.session.queue();h.setDisk('external edit');
 assert.equal(await h.session.flush(),false);assert.equal(h.disk,'external edit');assert.equal(h.writes.length,0);assert.equal(h.session.state,'error');assert.match(h.session.error.message,/changed outside/);
});
test('a failed disk write aborts the stream and retains pending edits for reconnect',async t=>{
 const h=harness(t);h.setText('local edit');h.setFailure(true);h.session.queue();
 assert.equal(await h.session.flush(),false);assert.equal(h.disk,'original');assert.equal(h.aborted,1);assert.equal(h.session.savedText,'original');
 h.setFailure(false);assert.equal(await h.session.resume(),true);assert.equal(h.disk,'local edit');
});
test('switching projects cancels a queued save to the previous project',async t=>{
 const h=harness(t);h.setText('previous file edit');h.session.queue();const pending=h.session.flush();h.session.detach();
 h.setText('new project');await pending;assert.equal(h.disk,'original');assert.equal(h.writes.length,0);
});
test('Save as writes even when current text equals the initial editor snapshot',async t=>{
 const h=harness(t);h.session.attach(h.handle,{diskText:'original',savedText:null,granted:true});
 assert.equal(await h.session.flush(),true);assert.deepEqual(h.writes,['original']);
});
test('restoring a known handle preserves dirty recovery edits and respects permissions',async t=>{
 const h=harness(t);h.setText('recovered newer edit');h.session.attach(h.handle,{diskText:'original',savedText:'original',granted:false});
 assert.equal(h.session.state,'permission');assert.equal(await h.session.flush(),false);assert.equal(h.writes.length,0);
 assert.equal(await h.session.resume(),true);assert.equal(h.disk,'recovered newer edit');
});
