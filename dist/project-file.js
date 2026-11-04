/** Serialized, debounced writes to a user-chosen JSON file. Never prompts in background. */
export class JSONFileAutosave {
  constructor({getText,onStatus=()=>{},onRecord=()=>{},delay=700}) {
    Object.assign(this,{getText,onStatus,onRecord,delay,handle:null,savedText:null,diskText:null,latest:null,paused:false,error:null,generation:0,chain:Promise.resolve(),timer:null,writing:false});
  }
  status(state) {this.state=state;this.onStatus({state,name:this.handle?.name||'',error:this.error,dirty:!!this.handle&&this.latest!==this.savedText});}
  attach(handle,{diskText,savedText=this.getText(),granted=false}) {
    clearTimeout(this.timer);this.generation++;this.handle=handle;this.diskText=diskText;this.savedText=savedText;this.latest=this.getText();this.paused=!granted;this.error=null;
    this.record();this.status(this.paused?'permission':this.latest===this.savedText?'saved':'pending');
    if(!this.paused&&this.latest!==this.savedText)this.schedule();
  }
  detach() {clearTimeout(this.timer);this.generation++;this.handle=null;this.paused=false;this.error=null;this.onRecord(null);this.status('browser');}
  record() {this.onRecord({handle:this.handle,diskText:this.diskText,savedText:this.savedText});}
  schedule() {clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.flush();},this.delay);}
  queue(text=this.getText()) {
    this.latest=text;if(!this.handle)return;
    if(this.paused){this.status(this.error?'error':'permission');return;}
    this.status(text===this.savedText?'saved':'pending');
    clearTimeout(this.timer);if(text!==this.savedText)this.schedule();
  }
  async resume() {
    if(!this.handle)return false;
    try {
      const granted=await this.handle.requestPermission({mode:'readwrite'});
      if(granted!=='granted'){this.paused=true;this.status('permission');return false;}
      this.paused=false;this.error=null;this.queue();return await this.flush();
    } catch(error){this.paused=true;this.error=error;this.status('error');return false;}
  }
  flush() {
    clearTimeout(this.timer);
    const generation=this.generation,handle=this.handle;
    const work=async()=>{
      if(!handle||generation!==this.generation||this.paused)return false;
      if(this.latest===this.savedText){this.status('saved');return true;}
      let writer;
      try {
        if(await handle.queryPermission({mode:'readwrite'})!=='granted') {this.paused=true;this.status('permission');return false;}
        const disk=await (await handle.getFile()).text();
        if(generation!==this.generation)return false;
        if(this.diskText!==null&&disk!==this.diskText)throw new Error('This JSON file changed outside Pointwise. Use Save as to keep your current map.');
        const text=this.latest;this.writing=true;this.status('saving');
        writer=await handle.createWritable();
        if(generation!==this.generation){await writer.abort();return false;}
        await writer.write(text);await writer.close();writer=null;
        if(generation!==this.generation)return true;
        this.savedText=text;this.diskText=text;this.error=null;this.record();
        this.status(this.latest===text?'saved':'pending');
        if(this.latest!==text)this.schedule();
        return true;
      } catch(error) {
        if(writer)try{await writer.abort();}catch{}
        if(generation===this.generation){this.paused=true;this.error=error;this.status('error');}
        return false;
      } finally {this.writing=false;}
    };
    const locked=()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('pointwise-json-write',work):work();
    this.chain=this.chain.then(locked,locked);return this.chain;
  }
}

let fileDatabase;
function projectFileDB() {
  if(!fileDatabase)fileDatabase=new Promise((resolve,reject)=>{
    const request=indexedDB.open('pointwise-project-file',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('files');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return fileDatabase;
}
export async function rememberProjectFile(record) {
  const db=await projectFileDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('files','readwrite'),store=tx.objectStore('files');
    if(record)store.put(record,'current');else store.delete('current');
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);
  });
}
export async function recallProjectFile() {
  const db=await projectFileDB();
  return new Promise((resolve,reject)=>{
    const request=db.transaction('files').objectStore('files').get('current');
    request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);
  });
}
