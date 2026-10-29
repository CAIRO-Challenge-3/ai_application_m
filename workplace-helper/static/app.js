/* Pepper UI: browser camera today; optional NAOqi bridge when robot is connected. */
const $ = s => document.querySelector(s);
const state = {view:'home', room:ROOMS[0], required:['helmet','gloves'], attempts:0,
  passed:false, stream:null, busy:false, cameraActive:false, epoch:0, sound:true,
  source:'browser', speechSource:'browser', lastSpeech:'', helpId:null, helpPoll:null,
  captureTimer:null, frameTimer:null, controller:null, modalSpeech:'', zoom:1};
let speechEpoch=0, speechQueue=Promise.resolve();
function queuePepperSpeech(text){speechQueue=speechQueue.catch(()=>{}).then(()=>fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}));return speechQueue;}
function hydrate(root=document) { root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon)); }
function toast(text) { $('#toast').textContent=text; $('#toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').classList.add('hidden'),5500); }
function stopSpeech() { speechEpoch++; if ('speechSynthesis' in window) speechSynthesis.cancel(); if(state.speechSource==='pepper') queuePepperSpeech('').catch(()=>{}); }
async function speak(text) {
  state.lastSpeech=text; if(!state.sound) return; const token=++speechEpoch;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if(state.speechSource==='pepper') {
    try {const r=await queuePepperSpeech(text); if(r.ok) return; } catch(e) {}
    if(token!==speechEpoch) return;
    toast('Pepper spricht gerade nicht. Ich versuche die Stimme dieses Geräts.');
  }
  if (!('speechSynthesis' in window)) {toast('Keine Stimme verfügbar. Die Bilder und Texte bleiben sichtbar.');return;}
  const u=new SpeechSynthesisUtterance(text);u.lang='de-DE';u.rate=.88;
  const voices=speechSynthesis.getVoices();const voice=voices.find(v=>v.lang.toLowerCase().startsWith('de')&&v.localService)||voices.find(v=>v.lang.toLowerCase().startsWith('de'));
  if(voice)u.voice=voice;
  u.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))toast('Die Stimme ist nicht verfügbar. Bitte prüfe die Lautstärke und die Sprach-Einstellungen.');};
  speechSynthesis.speak(u);
}
function showView(name) {
  if(name!=='check') stopCamera(); stopSpeech();
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===name));state.view=name;window.scrollTo(0,0);
}
function showModal(title,body,spoken,eyebrow='PEPPER ERKLÄRT') {
  clearInterval(state.helpPoll);state.helpPoll=null;state.modalSpeech=spoken;
  $('#modalTitle').textContent=title;$('#modalEyebrow').textContent=eyebrow;$('#modalBody').innerHTML=body;
  state.zoom=1;$('#doneModal').textContent='Verstanden';hydrate($('#modal'));
  if(!$('#modal').open)$('#modal').showModal(); speak(spoken);
}
function closeModal(){ $('#modal').close();stopSpeech();clearInterval(state.helpPoll);state.helpPoll=null; }
$('#closeModal').onclick=closeModal;$('#doneModal').onclick=closeModal;
$('#modal').addEventListener('cancel',()=>{stopSpeech();clearInterval(state.helpPoll);});
$('#repeatVoice').onclick=()=>speak(state.modalSpeech);
$('#sound').onclick=()=>{state.sound=!state.sound;$('#sound').setAttribute('aria-pressed',String(state.sound));$('#sound').lastElementChild.textContent=state.sound?'Ton an':'Ton aus';if(state.sound)speak('Der Ton ist an.');else stopSpeech();};
$('#greeting').onclick=()=>speak('Hallo! Ich bin Pepper. Schön, dass du da bist. Ich helfe dir beim Sicherheits-Check und zeige dir die Werkstatt.');
function roomById(id){return ROOMS.find(r=>r.id===id)||ROOMS[0];}
function visualSteps(steps){return '<div class="visual-steps '+(steps.length===2?'two':'')+'">'+steps.map((s,i)=>'<div class="visual-step"><span class="step-number">'+(i+1)+'</span>'+icon(s[0])+'<p>'+s[1]+'</p></div>').join('')+'</div>';}
function setRoom(room){state.room=room;$('#workplace').value=room.id;}
function renderRoom(room){setRoom(room);$('#roomEyebrow').textContent='ERDGESCHOSS · BEREICH '+room.number;$('#roomName').textContent=room.name;$('#roomIcon').innerHTML=icon(room.icon);$('#roomSigns').innerHTML=room.signs.map(key=>{const s=SIGNS[key];return '<button class="sign-card" data-sign="'+key+'"><span class="sign-visual '+s.color+'">'+icon(s.icon)+'</span><span><strong>'+s.title+'</strong><small>Erklärung anhören</small></span></button>';}).join('');$('#roomSigns').querySelectorAll('button').forEach(b=>b.onclick=()=>openSign(b.dataset.sign));showView('room');}
function openSign(key){const s=SIGNS[key];showModal(s.title,'<div class="explain-hero"><span class="sign-visual '+s.color+'">'+icon(s.icon)+'</span><p>'+s.text+'</p></div>'+visualSteps(s.steps),s.title+'. '+s.text+' '+s.steps.map(x=>x[1]+'.').join(' '),'ZEICHEN VERSTEHEN');}
$('#roomGrid').innerHTML=ROOMS.map(r=>'<button class="room-card" data-room="'+r.id+'">'+icon(r.icon)+'<span class="number">'+r.number+' / EG</span><h2>'+r.name+'</h2><p>'+r.description+'</p></button>').join('');
$('#roomGrid').querySelectorAll('button').forEach(b=>b.onclick=()=>renderRoom(roomById(b.dataset.room)));
$('#workplace').innerHTML=ROOMS.map(r=>'<option value="'+r.id+'">'+r.name+'</option>').join('');
$('#workplace').onchange=()=>setRoom(roomById($('#workplace').value));
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.action;if(action==='home')showView('home');if(action==='rooms')showView('rooms');if(action==='before')beginSession();if(action==='help')openHelp();if(action==='overview')openMap('overview');});

function beginSession(){stopCamera();state.attempts=0;state.passed=false;state.helpId=null;$('#workplace').disabled=false;document.querySelectorAll('[name=profile]').forEach(x=>x.disabled=false);$('#checkHelp').classList.add('hidden');$('#goWork').classList.add('hidden');$('#retryCheck').classList.add('hidden');$('#startCheck').classList.remove('hidden');$('#checkInstruction').textContent='Wähle deinen Arbeitsplatz. Dann legen wir los.';drawChecks();setResult('Ich helfe dir beim Prüfen.','Zeig deinen Kopf und deine Hände.');showView('check');}
function drawChecks(checks=[]) {$('#gearChecks').innerHTML=state.required.map(key=>{const c=checks.find(x=>x.key===key);const mode=c?c.state:'pending';const label=key==='helmet'?'Helm':'Handschuhe';const text={pending:'Gleich schauen wir nach.',seen:'Im Bild erkannt',missing:'Bitte anziehen und zeigen',uncertain:'Noch nicht sicher erkannt'}[mode];return '<div class="gear-row '+mode+'">'+icon(key)+'<div><strong>'+label+'</strong><small>'+text+'</small></div><span class="gear-state">'+(mode==='seen'?'✓':mode==='pending'?'○':'?')+'</span></div>';}).join('');}
document.querySelectorAll('[name=profile]').forEach(input=>input.onchange=()=>{state.required=input.value==='both'?['helmet','gloves']:[input.value];drawChecks();});
function setResult(title,text,mode=''){const box=$('#checkResult');box.className='check-result '+mode;box.replaceChildren();if(mode==='pass'){const div=document.createElement('div');div.innerHTML=icon('check');box.append(div);}const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=text;box.append(h,p);}
function stopCamera(){state.epoch++;clearTimeout(state.captureTimer);clearTimeout(state.frameTimer);if(state.controller)state.controller.abort();state.controller=null;state.busy=false;state.cameraActive=false;if(state.stream)state.stream.getTracks().forEach(t=>t.stop());state.stream=null;$('#video').srcObject=null;$('#robotFrame').classList.add('hidden');$('#robotFrame').removeAttribute('src');$('#overlay').getContext('2d').clearRect(0,0,$('#overlay').width,$('#overlay').height);$('#cameraEmpty').classList.remove('hidden');$('#scanStatus').classList.add('hidden');$('#stopCamera').classList.add('hidden');$('#cameraLabel').textContent='Kamera aus';$('#startCheck').disabled=false;$('#retryCheck').disabled=false;}
async function pepperPreview(token){if(!state.cameraActive||token!==state.epoch)return;const image=$('#robotFrame');image.src='/api/pepper/frame?t='+Date.now();image.classList.remove('hidden');state.frameTimer=setTimeout(()=>pepperPreview(token),1500);}
async function startCamera(){
 if(state.cameraActive)return true; const token=++state.epoch;
 try{
   if(state.source==='pepper'){const r=await fetch('/api/pepper/frame');if(!r.ok)throw new Error('Pepper ist nicht erreichbar.');if(token!==state.epoch)return false;state.cameraActive=true;pepperPreview(token);}
   else {if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('Die Kamera braucht localhost oder eine sichere Verbindung.');const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960},height:{ideal:720},facingMode:'user'},audio:false});if(token!==state.epoch){stream.getTracks().forEach(t=>t.stop());return false;}state.stream=stream;$('#video').srcObject=stream;await $('#video').play();if(token!==state.epoch)return false;state.cameraActive=true;}
   $('#cameraEmpty').classList.add('hidden');$('#stopCamera').classList.remove('hidden');$('#cameraLabel').textContent=state.source==='pepper'?'Pepper-Kamera an':'Kamera an';return true;
 }catch(e){if(token!==state.epoch)return false;setResult('Die Kamera konnte nicht starten.','Bitte erlaube die Kamera oder hole Hilfe.','warn');$('#checkHelp').classList.remove('hidden');speak('Die Kamera konnte nicht starten. Bitte hole Hilfe.');return false;}
}
$('#startCheck').onclick=async()=>{if(state.busy)return;$('#startCheck').disabled=true;speak('Hallo! Ich bin Pepper. Wir prüfen jetzt deine Schutzkleidung. Zeig deinen Kopf und deine Hände.');if(await startCamera()){ $('#startCheck').classList.add('hidden');$('#retryCheck').classList.remove('hidden');$('#retryCheck').disabled=true;$('#checkInstruction').textContent='Bleib kurz stehen. Ich schaue nach.';state.captureTimer=setTimeout(runCheck,2300);}else $('#startCheck').disabled=false;};
$('#retryCheck').onclick=async()=>{if(state.busy)return;$('#retryCheck').disabled=true;if(await startCamera())await runCheck();else $('#retryCheck').disabled=false;};
$('#stopCamera').onclick=()=>{stopCamera();$('#startCheck').classList.toggle('hidden',state.attempts>0);$('#retryCheck').classList.toggle('hidden',state.attempts===0);};
function drawDetections(data){const c=$('#overlay');c.width=data.width;c.height=data.height;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);const names={Worker:'Person',Glove:'Handschuh',Hard_hat:'Helm','No-Glove':'Handschuh?', 'No-Helmet':'Helm?'};data.detections.filter(d=>names[d.label]).forEach(d=>{const[x,y,x2,y2]=d.box;ctx.strokeStyle=d.label.startsWith('No-')?'#f2a05f':'#88d8b0';ctx.lineWidth=3;ctx.strokeRect(x,y,x2-x,y2-y);ctx.fillStyle='#17261de6';ctx.font='bold 18px Arial';const width=ctx.measureText(names[d.label]).width+12;ctx.fillRect(x,Math.max(0,y-25),width,25);ctx.fillStyle='white';ctx.fillText(names[d.label],x+6,Math.max(19,y-7));});}
async function runCheck(){
 if(state.busy||!state.cameraActive)return;state.busy=true;const epoch=state.epoch;state.controller=new AbortController();const timer=setTimeout(()=>state.controller&&state.controller.abort(),90000);$('#retryCheck').disabled=true;$('#scanStatus').classList.remove('hidden');$('#workplace').disabled=true;document.querySelectorAll('[name=profile]').forEach(x=>x.disabled=true);
 try{const form=new FormData();state.required.forEach(k=>form.append('required',k));
   if(state.source==='pepper')form.append('source','pepper');else{const v=$('#video');if(!v.videoWidth)throw new Error('Camera not ready');const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;canvas.getContext('2d').drawImage(v,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));form.append('image',blob,'frame.jpg');}
   const response=await fetch('/api/detect',{method:'POST',body:form,signal:state.controller.signal});const data=await response.json();if(epoch!==state.epoch)return;if(!response.ok)throw new Error(data.error);
   state.attempts++;state.passed=data.assessment.passed;drawChecks(data.assessment.checks);drawDetections(data);const a=data.assessment;
   if(a.passed){setResult('Alle gewählten Prüfungen bestanden.','Gut gemacht! Ich zeige dir jetzt den Weg.','pass');$('#goWork').classList.remove('hidden');$('#checkHelp').classList.add('hidden');$('#retryCheck').classList.add('hidden');$('#checkInstruction').textContent='Der Demo-Check ist geschafft.';speak('Gut gemacht! Alle gewählten Prüfungen sind bestanden. Das ist ein Demo-Check, keine Arbeitsfreigabe. Tippe auf Zum Arbeitsplatz.');}
   else {let text;if(!a.person_ok)text=a.person_count>1?'Bitte nur eine Person vor die Kamera stellen.':'Bitte zeig deinen Kopf, deinen Körper und deine Hände.';else text='Bitte prüfe die markierte Schutzkleidung. Zieh sie an und zeig sie noch einmal.';if(state.attempts>=2)text+=' Ich kann eine Assistenz für dich rufen.';setResult(state.attempts>=2?'Wir holen uns Unterstützung.':'Schauen wir noch einmal.',text,'warn');$('#checkHelp').classList.toggle('hidden',state.attempts<2);$('#goWork').classList.add('hidden');speak(text);}
 }catch(e){if(epoch!==state.epoch)return;state.passed=false;setResult('Der Check klappt gerade nicht.','Bitte versuche es noch einmal oder rufe die Assistenz.','warn');$('#checkHelp').classList.remove('hidden');$('#goWork').classList.add('hidden');speak('Der Check klappt gerade nicht. Bitte versuche es noch einmal oder hole Hilfe.');}
 finally{clearTimeout(timer);if(epoch===state.epoch){state.busy=false;state.controller=null;$('#scanStatus').classList.add('hidden');$('#retryCheck').disabled=false;}}
}
$('#checkHelp').onclick=()=>openHelp('ppe');$('#goWork').onclick=()=>{if(!state.passed)return;stopCamera();openMap('route');};

function planSvg(mode,room){
 const boxes={assembly:[65,65,191,145],wood:[65,230,191,120],dining:[300,65,110,185],support:[458,65,192,145],sanitary:[458,230,192,120]};
 const path=room.routePoints;const route=mode==='route'||mode==='escape';const color=mode==='escape'?'#147753':'#bd622b';
 return '<svg class="plan" viewBox="0 0 720 510" role="img" aria-label="Vereinfachter Beispielplan des Erdgeschosses">'+
 '<defs><marker id="routeArrow" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6z" fill="'+color+'"/></marker></defs>'+
 '<rect width="720" height="510" fill="#f7f4ee"/><text x="24" y="28" font-size="12" fill="#786e64">ERDGESCHOSS · SCHEMATISCHE DARSTELLUNG</text><path d="M50 50H665V365H458V435H300V365H50Z" fill="white" stroke="#c5bdb3" stroke-width="3"/>'+
 '<path d="M280 140V385H434V140" fill="none" stroke="#f6e9d5" stroke-width="34"/>'+
 '<rect x="301" y="270" width="109" height="164" fill="#f8ead6"/><text x="355" y="341" text-anchor="middle" font-size="13" fill="#7f6b54">Empfang</text>'+
 ROOMS.map(r=>{const b=boxes[r.id];return '<g class="map-room" data-map-room="'+r.id+'" tabindex="0" role="button" aria-label="'+r.name+'"><rect x="'+b[0]+'" y="'+b[1]+'" width="'+b[2]+'" height="'+b[3]+'" rx="8" fill="'+(r.id===room.id&&mode!=='overview'?'#f5d7bb':'#e9eef0')+'" stroke="#bcc6ca" stroke-width="2"/><text x="'+(b[0]+b[2]/2)+'" y="'+(b[1]+b[3]/2-8)+'" text-anchor="middle" font-size="24" font-weight="bold" fill="#52616a">'+r.number+'</text><text x="'+(b[0]+b[2]/2)+'" y="'+(b[1]+b[3]/2+17)+'" text-anchor="middle" font-size="12" fill="#47545c">'+r.short+'</text></g>';}).join('')+
 (route?'<polyline points="'+(mode==='escape'?path.split(' ').reverse().join(' ')+' 350,476':path)+'" fill="none" stroke="white" stroke-width="12"/><polyline points="'+(mode==='escape'?path.split(' ').reverse().join(' ')+' 350,476':path)+'" fill="none" stroke="'+color+'" stroke-width="5" stroke-linejoin="round" marker-end="url(#routeArrow)"/>':'')+
 (mode==='fire'?'<g><rect x="'+(room.firePoint[0]-17)+'" y="'+(room.firePoint[1]-17)+'" width="34" height="34" fill="#bc3440" rx="5"/><svg x="'+(room.firePoint[0]-14)+'" y="'+(room.firePoint[1]-14)+'" width="28" height="28" viewBox="0 0 64 64" fill="none" stroke="white" stroke-width="4">'+drawings.fire+'</svg></g>':'')+
 '<path d="M331 435h38" stroke="#16815b" stroke-width="7"/><text x="350" y="455" text-anchor="middle" font-size="12" fill="#286c51">Haupteingang / Ausgang</text><text x="350" y="498" text-anchor="middle" font-size="12" fill="#706a62">Außenbereich · Sammelplatz vor Ort klären</text>'+
 (mode==='route'?'<circle cx="350" cy="422" r="8" fill="#bd622b"/><text x="381" y="420" font-size="11" fill="#91532f">Start</text>':'')+'</svg>';
}
function bindPlan(){document.querySelectorAll('[data-map-room]').forEach(el=>{const action=()=>{closeModal();renderRoom(roomById(el.dataset.mapRoom));};el.onclick=action;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action();}};});const zoomIn=$('#zoomIn'),zoomOut=$('#zoomOut');if(zoomIn)zoomIn.onclick=()=>zoomPlan(.4);if(zoomOut)zoomOut.onclick=()=>zoomPlan(-.4);}
function zoomPlan(delta){state.zoom=Math.min(2.6,Math.max(1,state.zoom+delta));$('.plan').style.height=(380*state.zoom)+'px';$('.plan').style.width=(state.zoom*100)+'%';}
function mapMarkup(mode,room){return '<div class="map-controls"><button id="zoomOut" aria-label="Karte verkleinern">−</button><button id="zoomIn" aria-label="Karte vergrößern">+</button></div><div class="map-wrap">'+planSvg(mode,room)+'</div>';}
function openMap(mode){const room=state.room;let title,body,speech;
 if(mode==='overview'){title='Deine Werkstatt';speech='Das ist ein Beispielplan. Tippe auf einen Raum, um mehr zu erfahren.';body='<p class="notice">Beispielplan. Die Räume sind vereinfacht dargestellt.</p>'+mapMarkup(mode,room)+'<details class="original-plan"><summary>Originalplan ansehen</summary><img src="/static/workshop-map.png" alt="Gelieferter Beispielplan der Werkstatt"></details>';}
 else if(mode==='escape'){title='Fluchtweg lernen';speech='Das ist ein Übungsweg, kein freigegebener Fluchtplan. '+room.escape+' Folge im Notfall den grünen Schildern vor Ort. Gehe nicht in Rauch. Bitte um Hilfe, wenn du Unterstützung brauchst.';body='<p class="notice"><strong>Übungsweg – vor Ort bestätigen.</strong> Im Notfall: den Schildern und der Assistenz vor Ort folgen.</p>'+mapMarkup(mode,room)+visualSteps([['exit','Zum Ausgang gehen'],['people','Zum markierten Sammelplatz'],['help','Bei der Gruppe bleiben']])+'<p class="small-note">Nicht in Rauch gehen. Bei blockiertem Weg Hilfe holen. Der Sammelplatz ist noch nicht festgelegt.</p>';}
 else {title='Dein Weg: '+room.name;speech='Beispielweg ab dem Empfang. '+room.route+' Bitte lass dir den Weg vor Ort bestätigen.';body='<p class="notice">Beispielweg · Start am Empfang. Kein aktueller Roboter-Standort.</p>'+mapMarkup(mode,room)+visualSteps([['home','Am Empfang starten'],['path','Dem gezeigten Weg folgen'],[room.icon,room.short]])+'<button class="button orange full" id="arrived">Ich bin im Raum</button>';}
 showModal(title,body,speech,mode==='escape'?'FLUCHTWEG · LERNBEISPIEL':'ORIENTIERUNG');bindPlan();if($('#arrived'))$('#arrived').onclick=()=>{closeModal();renderRoom(room);};
}
$('#routeButton').onclick=()=>openMap('route');$('#escapeButton').onclick=()=>openMap('escape');
$('#fireButton').onclick=()=>{const r=state.room;const speech=r.fire+' Das ist ein vorgeschlagener Standort. Bitte vor Ort prüfen. Halte den Zugang frei. Feuerlöscher nur nach Einweisung benutzen.';showModal('Wo ist der Feuerlöscher?','<div class="explain-hero"><span class="sign-visual red fire-sign">'+icon('fire')+'</span><p>'+r.fire+'</p></div><p class="notice">Standort-Vorschlag · noch nicht vor Ort bestätigt.</p>'+mapMarkup('fire',r)+'<p class="small-note">Zugang frei halten. Nur nach Einweisung benutzen. Im Brandfall hat die eigene Sicherheit Vorrang.</p>',speech,'FEUERLÖSCHER · STANDORT-VORSCHLAG');bindPlan();};
$('#taskButton').onclick=()=>{const r=state.room;showModal(r.task,visualSteps(r.steps)+(r.taskNote?'<p class="notice">'+r.taskNote+'</p>':''),r.task+'. '+r.steps.map((s,i)=>'Schritt '+(i+1)+'. '+s[1]+'.').join(' ')+(r.taskNote||''),'DEINE AUFGABE · SCHRITT FÜR SCHRITT');};
function newId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=crypto.getRandomValues(new Uint8Array(1))[0]%16;return(c==='x'?n:(n&3)|8).toString(16);});}
function openHelp(reason='general'){
 state.helpId=null;
 showModal('Wir holen Unterstützung.','<div class="help-message">'+icon('help')+'<p>Eine Assistenz kann dir helfen.<br>Bleib hier bei Pepper.</p></div><p class="small-note">Zielbereich: '+state.room.name+'. Die Nachricht geht an die lokale Assistenz-Ansicht.</p><button id="sendHelp" class="button orange full">'+icon('bell')+'Assistenz jetzt rufen</button><p id="helpStatus" role="status" class="small-note"></p>','Du brauchst Hilfe? Tippe auf Assistenz jetzt rufen. Bleib hier bei Pepper.','HILFE HOLEN');
 $('#sendHelp').onclick=async()=>{const button=$('#sendHelp');button.disabled=true;$('#helpStatus').textContent='Nachricht wird gesendet …';if(!state.helpId)state.helpId=newId();try{const r=await fetch('/api/help',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:state.helpId,room:state.room.id,reason})});if(!r.ok)throw new Error('Help unavailable');if(!document.body.contains(button))return;button.innerHTML=icon('check')+'An Assistenz-Ansicht gesendet';$('#helpStatus').textContent='Noch nicht bestätigt. Bitte warte hier. Wenn niemand reagiert, sprich eine Person direkt an.';speak('Die Nachricht wurde an die Assistenz-Ansicht gesendet. Sie ist noch nicht bestätigt. Bitte warte hier.');state.helpPoll=setInterval(pollHelp,3000);pollHelp();}catch(e){if(!document.body.contains(button))return;button.disabled=false;$('#helpStatus').textContent='Nicht gesendet. Bitte versuche es erneut oder sprich eine Person direkt an.';speak('Die Nachricht konnte nicht gesendet werden. Bitte sprich eine Person direkt an.');}};
}
async function pollHelp(){try{const response=await fetch('/api/help/'+state.helpId);if(!response.ok)throw new Error();const data=await response.json();if(!$('#helpStatus'))return;if(data.status==='acknowledged'){$('#helpStatus').textContent='Eine Assistenz hat deine Nachricht bestätigt. Bitte bleib bei Pepper.';clearInterval(state.helpPoll);speak('Eine Assistenz hat deine Nachricht bestätigt. Bitte bleib hier bei Pepper.');}if(data.status==='resolved'){$('#helpStatus').textContent='Die Assistenz hat die Anfrage abgeschlossen.';clearInterval(state.helpPoll);state.helpId=null;}}catch(e){if($('#helpStatus'))$('#helpStatus').textContent='Verbindung zur Assistenz unterbrochen. Bitte sprich eine Person direkt an.';}}
$('#pepperArt').innerHTML=pepperArt;hydrate();drawChecks();
fetch('/api/status').then(r=>r.json()).then(data=>{state.source=data.camera_source;state.speechSource=data.speech_source;}).catch(()=>toast('Der lokale Dienst ist nicht erreichbar. Bitte starte die App.'));
window.addEventListener('pagehide',()=>{stopCamera();stopSpeech();});

