/* One question at a time. Location changes only after explicit user confirmation. */
const $ = selector => document.querySelector(selector);
const state = {
  view:'welcome', config:null, source:'browser', speechSource:'browser', sound:true,
  profile:null, current:'reception', passed:false, attempts:0, assessment:null,
  stream:null, cameraEpoch:0, controller:null, busy:false, route:null, routeEpoch:0,
  mode:'work', modalSpeech:'', helpPoll:null, zoom:1, prompt:''
};
let speechEpoch=0, speechQueue=Promise.resolve();
const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roomFor = id => ROOMS.find(r=>r.id===id)||ROOMS[0];
const nodeName = id => state.config?.nodes[id]?.name || 'Empfang';
const gearName = key => key==='helmet'?'Helm':'Handschuhe';
const face = '<span class="robot-face" aria-hidden="true"><i></i><i></i></span>';
function hydrate(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
function toast(text){$('#toast').textContent=text;$('#toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.add('hidden'),6500);}
function queueSpeech(text,token){speechQueue=speechQueue.catch(()=>{}).then(()=>{if(token!==speechEpoch)return null;return fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});});return speechQueue;}
function stopSpeech(){speechEpoch++;if('speechSynthesis' in window)speechSynthesis.cancel();if(state.speechSource==='pepper')queueSpeech('',speechEpoch).catch(()=>{});}
async function speak(text){
  state.prompt=text;if(!state.sound)return;const token=++speechEpoch;
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if(state.speechSource==='pepper'){
    try{const response=await queueSpeech(text,token);if(response?.ok)return;}catch(e){}
    if(token!==speechEpoch)return;
    toast('Pepper ist nicht hörbar. Ich versuche die Stimme am Bildschirm.');
  }
  if(!('speechSynthesis' in window)){toast('Keine Stimme verfügbar. Bilder und Text bleiben sichtbar.');return;}
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang='de-DE';utterance.rate=.84;
  const voices=speechSynthesis.getVoices();const voice=voices.find(v=>v.lang.startsWith('de')&&v.localService)||voices.find(v=>v.lang.startsWith('de'));
  if(voice)utterance.voice=voice;
  utterance.onerror=event=>{if(!['canceled','interrupted'].includes(event.error))toast('Bitte prüfe Lautstärke und deutsche Stimme auf diesem Gerät.');};
  speechSynthesis.speak(utterance);
}
function render(html,view){state.view=view;$('#stage').innerHTML=html;hydrate($('#stage'));}
function scene(content){return '<section class="scene">'+content+'</section>';}
function actions(content){return '<div class="scene-actions">'+content+'</div>';}
function button(id,text,kind='solid-button',symbol=''){return '<button id="'+id+'" class="'+kind+'">'+(symbol?icon(symbol):'')+text+'</button>';}
function showModal(title,html,spoken,eyebrow='PEPPER ERKLÄRT'){
  clearInterval(state.helpPoll);state.helpPoll=null;state.modalSpeech=spoken;
  $('#modalTitle').textContent=title;$('#modalEyebrow').textContent=eyebrow;$('#modalBody').innerHTML=html;
  $('#modalDone').textContent='Verstanden';$('#modalDone').onclick=closeModal;hydrate($('#modal'));
  if(!$('#modal').open)$('#modal').showModal();speak(spoken);
}
function closeModal(){if($('#modal').open)$('#modal').close();stopSpeech();clearInterval(state.helpPoll);state.helpPoll=null;}
$('#closeModal').onclick=closeModal;$('#modalDone').onclick=closeModal;
$('#modal').addEventListener('cancel',()=>{stopSpeech();clearInterval(state.helpPoll);});
$('#modalListen').onclick=()=>speak(state.modalSpeech);
$('#sound').onclick=()=>{state.sound=!state.sound;$('#sound').setAttribute('aria-pressed',String(state.sound));$('#sound').setAttribute('aria-label',state.sound?'Ton ausschalten':'Ton einschalten');$('#sound').style.opacity=state.sound?'1':'.5';if(state.sound)speak('Ich bin wieder hörbar.');else stopSpeech();};
function stopCamera(){state.cameraEpoch++;if(state.controller)state.controller.abort();state.controller=null;state.busy=false;if(state.stream)state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
function resetSession(){stopCamera();state.routeEpoch++;closeModal();state.profile=null;state.current='reception';state.passed=false;state.attempts=0;state.assessment=null;state.route=null;state.mode='work';renderWelcome();}
$('#restart').onclick=()=>{if(state.view==='welcome')return;showModal('Neue Person starten?','<p class="modal-description">Dein aktueller Check wird beendet.</p>'+actions(button('confirmReset','Ja, neu starten')),'Möchtest du deinen Check beenden und eine neue Person starten?','NEU STARTEN');$('#confirmReset').onclick=resetSession;};
function renderWelcome(){
  render(scene('<p class="eyebrow">DEIN PERSÖNLICHER ARBEITSBEGLEITER</p><div class="welcome-orbit"><span class="orbit-dot"></span><button id="welcome" class="welcome-button">'+face+'<strong>Willkommen</strong><small>WELCOME · ANTIPPEN</small></button></div><p class="welcome-caption"><strong>Ich bin Pepper.</strong><br>Wir starten deinen Tag. Schritt für Schritt.</p><p class="scene-note">Demo mit Beispiel-Schichtplan</p>'),'welcome');
  $('#welcome').onclick=()=>{if(!state.config){toast('Der Dienst lädt noch. Bitte starte die App, falls er nicht erreichbar ist.');return;}document.documentElement.requestFullscreen?.().catch(()=>{});renderProfiles();};
}
function renderProfiles(){
  render(scene('<div class="companion-small">'+face+'</div><h1>Wer startet heute?</h1><p class="lead">Wähle deinen Namen.</p><div class="profile-stack">'+state.config.profiles.map(p=>'<button class="profile-button" data-profile="'+p.id+'"><span class="profile-initial">'+escapeHTML(p.name[0])+'</span>'+escapeHTML(p.name)+icon('arrow')+'</button>').join('')+'</div><p class="scene-note">Beispielprofile für die Demo. Kein echter Personal-Schichtplan.</p>'),'profiles');
  document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{state.profile=state.config.profiles.find(p=>p.id===b.dataset.profile);renderReady();});
  speak('Willkommen! Wer startet heute? Wähle bitte deinen Namen.');
}
function gearTokens(checks=[]){return '<div class="gear-list">'+state.profile.required.map(key=>{const check=checks.find(c=>c.key===key);return '<div class="gear-token '+(check?.state||'')+'">'+icon(key)+'<span>'+gearName(key)+(check?'<small style="display:block;font-weight:400;font-size:12px;margin-top:3px">'+(check.state==='seen'?'Erkannt':'Noch nicht sicher erkannt')+'</small>':'')+'</span></div>';}).join('')+'</div>';}
function renderReady(){
  render(scene('<div class="companion-small">'+face+'</div><p class="eyebrow">HALLO, '+escapeHTML(state.profile.name.toUpperCase())+'</p><h1>Bist du bereit<br>für den Sicherheits-Check?</h1><p class="lead">Zeig deinen Kopf, deinen Körper und deine Hände.</p>'+gearTokens()+actions(button('yesCheck','Ja, jetzt prüfen','solid-button','camera')+button('notReady','Noch nicht','text-button'))+'<p class="scene-note">KI-Demo · keine Arbeitsfreigabe.</p>'),'ready');
  $('#yesCheck').onclick=inspect;$('#notReady').onclick=()=>{render(scene('<div class="companion-small">'+face+'</div><h1>Ich warte auf dich.</h1><p class="lead">Nimm dir die Zeit, die du brauchst.</p>'+actions(button('readyAgain','Jetzt bin ich bereit'))),'waiting');$('#readyAgain').onclick=renderReady;speak('Ich warte auf dich. Nimm dir die Zeit, die du brauchst.');};
  speak('Hallo '+state.profile.name+'. Bist du bereit für den Sicherheits-Check? Ich prüfe '+state.profile.required.map(gearName).join(' und ')+'. Tippe auf Ja, wenn du bereit bist.');
}
async function inspect(){
  if(state.busy||!state.profile)return;stopCamera();const token=state.cameraEpoch;state.busy=true;state.passed=false;
  render(scene('<p class="eyebrow">ICH BIN FÜR DICH DA</p><h1 class="inspection-title">Bleib einen Moment stehen.</h1><div class="camera-frame"><div class="camera-placeholder">'+icon('camera')+'</div><video id="cameraVideo" autoplay playsinline muted></video><img id="pepperFrame" class="hidden" alt="Bild der Pepper-Kamera"><div class="scan-corners"></div><div class="scanline"></div></div><p class="lead" id="inspectionStatus">Ich schaue nach deiner Schutzkleidung.</p>'+actions(button('cancelCheck','Stopp','soft-button'))),'inspecting');
  $('#cancelCheck').onclick=()=>{stopCamera();renderReady();};
  speak('Bleib einen Moment stehen. Ich schaue nach deiner Schutzkleidung.');
  try{
    const form=new FormData();state.profile.required.forEach(key=>form.append('required',key));
    if(state.source==='pepper'){
      const img=$('#pepperFrame');img.src='/api/pepper/frame?t='+Date.now();img.classList.remove('hidden');form.append('source','pepper');
    }else{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera unavailable');
      const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960},height:{ideal:720},facingMode:'user'},audio:false});
      if(token!==state.cameraEpoch){stream.getTracks().forEach(t=>t.stop());return;}
      state.stream=stream;const video=$('#cameraVideo');video.srcObject=stream;await video.play();
      await new Promise(resolve=>setTimeout(resolve,1200));if(token!==state.cameraEpoch)return;
      if(!video.videoWidth)throw new Error('No frame');
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));form.append('image',blob,'inspection.jpg');
    }
    if(token!==state.cameraEpoch)return;const controller=new AbortController();state.controller=controller;
    const timer=setTimeout(()=>controller.abort(),90000);let response;
    try{response=await fetch('/api/detect',{method:'POST',body:form,signal:controller.signal});}finally{clearTimeout(timer);}
    if(token!==state.cameraEpoch)return;if(!response.ok)throw new Error('Inspection unavailable');
    const result=await response.json();if(token!==state.cameraEpoch)return;
    state.attempts++;state.assessment=result.assessment;state.passed=result.assessment.passed;
    stopCamera();if(state.passed)renderPassed();else renderFailed();
  }catch(error){if(token!==state.cameraEpoch)return;console.warn('Inspection unavailable:', error.name, error.message);stopCamera();renderInspectionError();}
}
function renderFailed(){
  const missing=state.assessment.checks.filter(c=>c.state!=='seen').map(c=>c.name);
  let message=missing.length?missing.join(' und ')+' noch nicht sicher erkannt.':'Ich konnte die Schutzkleidung nicht eindeutig prüfen.';
  if(!state.assessment.person_ok)message=state.assessment.person_count>1?'Bitte nur eine Person ins Bild stellen.':'Bitte zeig deinen Kopf, deinen Körper und deine Hände.';
  render(scene('<div class="result-orb attention">'+icon('eye')+'</div><h1>Schauen wir noch einmal.</h1><p class="lead">'+escapeHTML(message)+'</p>'+gearTokens(state.assessment.checks)+'<p class="quiet-prompt">Prüfe deine Schutzkleidung. Ich warte auf dich.</p>'+actions(button('reinspect','Erneut prüfen','solid-button','camera')+(state.attempts>=2?button('failedHelp','Assistenz rufen','soft-button','help'):''))+'<p class="scene-note">Die Kamera ist aus. Erst dein nächster Tap startet einen neuen Check.</p>'),'failed');
  $('#reinspect').onclick=inspect;if($('#failedHelp'))$('#failedHelp').onclick=()=>openHelp('ppe');
  speak(message+' Prüfe deine Schutzkleidung. Ich warte auf dich. Tippe auf Erneut prüfen, wenn du bereit bist.'+(state.attempts>=2?' Du kannst auch eine Assistenz rufen.':''));
}
function renderInspectionError(){render(scene('<div class="result-orb attention">'+icon('camera')+'</div><h1>Der Check klappt gerade nicht.</h1><p class="lead">Prüfe den Kamera-Zugriff.<br>Oder lass dir helfen.</p>'+actions(button('retryError','Erneut versuchen')+button('errorHelp','Assistenz rufen','soft-button','help'))),'inspection-error');$('#retryError').onclick=inspect;$('#errorHelp').onclick=()=>openHelp('ppe');speak('Der Check klappt gerade nicht. Möchtest du es erneut versuchen oder eine Assistenz rufen?');}
function renderPassed(){const room=roomFor(state.profile.room);render(scene('<div class="result-orb">'+icon('check')+'</div><p class="eyebrow">DEMO-CHECK BESTANDEN</p><h1>Willkommen, '+escapeHTML(state.profile.name)+'.</h1><div class="shift-summary">'+icon(room.icon)+'<div><small>DEINE HEUTIGE DEMO-SCHICHT</small><strong>'+escapeHTML(state.profile.station)+'</strong><p>'+room.name+'</p></div></div><p class="success-question">Soll ich dir den Weg zeigen?</p>'+actions(button('showWorkRoute','Ja, zeig mir den Weg','solid-button','arrow'))+'<p class="scene-note">Alle gewählten Prüfungen bestanden · keine Arbeitsfreigabe.</p>'),'passed');$('#showWorkRoute').onclick=()=>loadRoute('work');speak('Willkommen, '+state.profile.name+'. Dein Demo-Check ist bestanden. Heute ist dein Beispiel-Arbeitsplatz '+state.profile.station+', '+room.name+'. Soll ich dir den Weg zeigen?');}

async function loadRoute(mode){
  if(mode==='work'&&!state.passed)return;const token=++state.routeEpoch;state.mode=mode;stopCamera();
  render(scene('<div class="intro-icon">'+icon(mode==='exit'?'exit':'map')+'</div><h1>Ich zeige dir den Weg.</h1>'),'route-loading');
  try{const response=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current:state.current,profile:state.profile?.id,mode})});
    if(token!==state.routeEpoch)return;if(!response.ok)throw new Error('Route unavailable');const route=await response.json();if(token!==state.routeEpoch)return;state.route=route;state.zoom=1;renderMap();
    const next=route.path[1];
    if(mode==='exit')speak('Bleib ruhig. Das ist ein Beispielweg, kein bestätigter Fluchtplan. Der rote Weg führt vom bestätigten Standort zum hinterlegten Hauptausgang. Folge im Notfall den grünen Schildern vor Ort. Gehe nicht in Rauch. Bitte eine Person um Hilfe, wenn du Unterstützung brauchst.');
    else speak(next?'Der orange Weg führt zu '+state.profile.station+'. Dein bestätigter Start ist '+nodeName(state.current)+'. Der nächste Punkt ist '+nodeName(next)+'. Tippe erst auf Hier angekommen, wenn du dort bist.':'Du hast deinen zugewiesenen Arbeitsplatz bestätigt. Möchtest du deine Aufgabe sehen?');
  }catch(error){if(token!==state.routeEpoch)return;render(scene('<div class="result-orb attention">'+icon('help')+'</div><h1>Kein Weg verfügbar.</h1><p class="lead">Bitte orientiere dich an den Schildern vor Ort.<br>Frage eine Person nach Hilfe.</p>'+actions(button('routeRetry','Weg erneut laden')+button('routeErrorHelp','Assistenz rufen','soft-button'))),'route-error');$('#routeRetry').onclick=()=>loadRoute(mode);$('#routeErrorHelp').onclick=()=>openHelp();speak('Ich kann gerade keinen Weg anzeigen. Folge den Schildern vor Ort und frage eine Person um Hilfe.');}
}
function exitNow(){closeModal();stopCamera();stopSpeech();if(!state.config){toast('Kein Plan geladen. Folge den grünen Schildern vor Ort und hole Hilfe.');speak('Bleib ruhig. Folge den grünen Schildern vor Ort und bitte eine Person um Hilfe.');return;}loadRoute('exit');}
$('#exitButton').onclick=exitNow;$('#modalExit').onclick=exitNow;
function routeSVG(){
  const nodes=state.config.nodes, route=state.route, destination=route.destination, emergency=state.mode==='exit';
  const positions={assembly:[80,60,230,170],wood:[80,310,230,160],dining:[420,60,220,170],support:[750,60,240,170],sanitary:[750,310,240,160]};
  const points=route.path.map(id=>nodes[id].x+','+nodes[id].y).join(' ');const current=nodes[state.current];
  const target=nodes[destination];const color=emergency?'#b92c3b':'#ee792f';
  return '<svg class="plant-map" viewBox="0 0 1100 570" role="group" aria-label="Beispielkarte mit '+(emergency?'rotem Ausgangsweg':'orangem Weg zum Arbeitsplatz')+'">'+
   '<defs><pattern id="floorGrid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#ede7dc" stroke-width=".5"/></pattern><filter id="pinShadow"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity=".12"/></filter></defs>'+
   '<rect x="20" y="20" width="1060" height="535" rx="25" fill="url(#floorGrid)"/>'+
   '<path d="M60 40H1010V490H650V540H410V490H60Z" fill="#fffdf8" stroke="#d5cec3" stroke-width="3"/>'+
   '<path d="M350 165V390M350 270H710M710 165V390M530 165V520" stroke="#f0e9dc" stroke-width="55" fill="none"/>'+
   '<rect x="420" y="310" width="220" height="160" rx="15" fill="#f2ece1" stroke="#e1d6c6" stroke-width="2"/>'+
   '<text x="447" y="343" font-size="18" fill="#7f7363">EMPFANG</text>'+
   ROOMS.map(r=>{const[x,y,w,h]=positions[r.id];const assigned=state.profile?.room===r.id;return '<g role="button" tabindex="0" data-room="'+r.id+'" aria-label="'+r.name+'"><rect class="room-shape" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="15" fill="'+(assigned?'#ffedda':'#f0f3f4')+'" stroke="'+(assigned?'#e6af7f':'#d6dde0')+'" stroke-width="2"/><text x="'+(x+20)+'" y="'+(y+30)+'" font-size="12" letter-spacing="1.5" fill="#7a858d">'+r.number+' / EG</text><text x="'+(x+20)+'" y="'+(y+58)+'" font-size="20" font-weight="bold" fill="#47535d">'+r.short+'</text></g>';}).join('')+
   '<text x="530" y="288" font-size="13" fill="#9d8d77" text-anchor="middle">FLUR</text>'+
   (route.path.length>1?'<polyline points="'+points+'" fill="none" stroke="white" stroke-width="20" stroke-linejoin="round" stroke-linecap="round"/><polyline data-route-line class="route-line '+(emergency?'exit-route':'')+'" points="'+points+'"/>':'')+
   '<rect x="505" y="491" width="50" height="16" rx="4" fill="#187753"/><text x="530" y="553" font-size="14" font-weight="bold" fill="#267657" text-anchor="middle">HAUPTAUSGANG</text>'+
   (state.mode==='work'?'<circle cx="'+target.x+'" cy="'+target.y+'" r="20" fill="'+color+'" stroke="white" stroke-width="4"/><path d="m'+(target.x-8)+' '+target.y+' 5 5 11-12" fill="none" stroke="white" stroke-width="3"/><text x="'+target.x+'" y="'+(target.y+40)+'" text-anchor="middle" font-size="16" font-weight="bold" fill="#a95720">'+escapeHTML(state.profile.station)+'</text>':'<circle cx="'+target.x+'" cy="'+target.y+'" r="13" fill="#b92c3b" stroke="white" stroke-width="3"/>')+
   route.signs.map(marker=>{const s=SIGNS[marker.key];const colors={blue:'#2767bb',red:'#c53647',green:'#177a55',yellow:'#f1c247'};const c=colors[s.color];const shape=s.color==='yellow'?'<path d="M0-29 30 25H-30Z" fill="'+c+'" stroke="white" stroke-width="3"/>':s.color==='green'?'<rect x="-25" y="-25" width="50" height="50" rx="8" fill="'+c+'" stroke="white" stroke-width="3"/>':'<circle r="26" fill="'+(s.color==='red'?'white':c)+'" stroke="'+(s.color==='red'?c:'white')+'" stroke-width="4"/>';return '<g role="button" tabindex="0" class="route-sign" data-sign="'+marker.key+'" aria-label="'+s.title+'" transform="translate('+marker.x+' '+marker.y+')" filter="url(#pinShadow)"><title>'+s.title+'</title>'+shape+'<svg x="-18" y="'+(s.color==='yellow'?'-9':'-18')+'" width="36" height="36" viewBox="0 0 64 64" fill="none" stroke="'+(s.color==='red'?c:s.color==='yellow'?'#332b19':'white')+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">'+drawings[s.icon]+'</svg></g>';}).join('')+
   '<g aria-label="Dein bestätigter Standort"><circle cx="'+current.x+'" cy="'+current.y+'" r="25" fill="#2c3a47" fill-opacity=".1"/><circle cx="'+current.x+'" cy="'+current.y+'" r="13" fill="#263b4b" stroke="white" stroke-width="4"/><rect x="'+(current.x-42)+'" y="'+(current.y+23)+'" width="84" height="24" rx="12" fill="#263b4b"/><text x="'+current.x+'" y="'+(current.y+40)+'" text-anchor="middle" font-size="12" fill="white">DU BIST HIER</text></g></svg>';
}
function renderMap(){
  const emergency=state.mode==='exit', arrived=state.route.path.length===1, next=state.route.path[1];
  const title=emergency?'Ruhig zum Ausgang.':'Dein Weg, '+state.profile.name+'.';
  const subtitle=emergency?'Ausgang im Beispielplan: '+nodeName(state.route.destination):'Heute: '+state.profile.station+' · '+roomFor(state.profile.room).short;
  const nextPrompt=arrived?(emergency?'Du hast den Ausgang bestätigt.':'Du bist am zugewiesenen Arbeitsplatz.'):'Nächster Punkt: '+nodeName(next);
  render('<section class="map-scene '+(emergency?'emergency-mode':'')+'"><div class="map-heading"><div><h1>'+escapeHTML(title)+'</h1><p>'+escapeHTML(subtitle)+'</p></div><button id="location" class="location-button">Standort bestätigen</button></div>'+(emergency?'<p class="emergency-strip">Demo-Fluchtweg · vor Ort bestätigen. Folge im Notfall den grünen Schildern. Nicht in Rauch gehen.</p>':'')+'<div class="map-board"><div class="map-viewport">'+routeSVG()+'</div><div class="map-tools"><button id="zoomOut" aria-label="Karte verkleinern">−</button><button id="zoomIn" aria-label="Karte vergrößern">+</button></div><span class="map-caption">BEISPIELPLAN · STANDORT MANUELL BESTÄTIGT</span><span class="map-legend"><i style="background:#c53647"></i><i style="background:#2767bb"></i><i style="background:#177a55"></i><i style="background:#f1c247"></i>Zeichen antippen</span></div><div class="journey-prompt"><div><small>'+(emergency?'BLEIB RUHIG':'ICH BEGLEITE DICH')+'</small><strong>'+escapeHTML(nextPrompt)+'</strong></div>'+button('mapNext',arrived?(emergency?'Was jetzt?':'Meine Aufgabe zeigen'):'Hier angekommen','solid-button',arrived?'help':'check')+'</div><div class="map-bottom">'+button('repeatRoute','Noch einmal hören','text-button','speaker')+button('mapHelp','Hilfe','text-button','help')+button('mapMore',emergency?'Zurück':'Mein Arbeitsplatz','text-button',emergency?'arrow':'box')+'</div></section>','map');
  $('#mapNext').onclick=()=>{if(arrived){if(emergency)showModal('Draußen zusammenbleiben.','<div class="big-sign green">'+icon('people')+'</div><p class="modal-description">Gehe zum ausgeschilderten Sammelplatz.<br>Bleib bei deiner Gruppe.</p><p class="modal-note">Der Sammelplatz ist in diesem Beispielplan nicht festgelegt.</p>','Gehe zum ausgeschilderten Sammelplatz vor Ort. Bleib bei deiner Gruppe. Bitte eine Person um Hilfe, wenn du Unterstützung brauchst.');else showTask(roomFor(state.profile.room));}else confirmWaypoint(next);};
  $('#repeatRoute').onclick=()=>speak(emergency?'Bleib ruhig. Folge dem roten Beispielweg. Folge im Notfall den grünen Schildern vor Ort. Gehe nicht in Rauch.':state.route.path.length>1?'Der nächste Punkt ist '+nodeName(next)+'. Folge dem orangenen Weg. Tippe auf Hier angekommen, wenn du dort bist.':'Du bist am Arbeitsplatz. Möchtest du deine Aufgabe sehen?');
  $('#mapHelp').onclick=()=>openHelp();$('#mapMore').onclick=()=>{if(emergency){state.passed?loadRoute('work'):renderWelcome();}else openRoom(roomFor(state.profile.room));};
  $('#location').onclick=chooseLocation;$('#zoomIn').onclick=()=>zoomMap(.35);$('#zoomOut').onclick=()=>zoomMap(-.35);
  document.querySelectorAll('[data-sign]').forEach(el=>bindAccessible(el,()=>openSign(el.dataset.sign)));
  document.querySelectorAll('[data-room]').forEach(el=>bindAccessible(el,()=>openRoom(roomFor(el.dataset.room))));
}
function bindAccessible(element,action){element.onclick=action;element.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();}};}
function zoomMap(delta){state.zoom=Math.max(1,Math.min(2.4,state.zoom+delta));$('.plant-map').style.width=(state.zoom*100)+'%';$('.plant-map').style.height=(state.zoom*100)+'%';}
function confirmWaypoint(next){showModal('Bist du hier angekommen?','<div class="intro-icon" style="margin:10px auto 20px">'+icon('map')+'</div><p class="modal-description">'+escapeHTML(nodeName(next))+'</p>'+actions(button('confirmWaypoint','Ja, ich bin hier')+button('notThere','Noch nicht','soft-button')),'Bist du bei '+nodeName(next)+' angekommen? Bestätige bitte nur, wenn du dort bist.','STANDORT BESTÄTIGEN');$('#confirmWaypoint').onclick=()=>{state.current=next;closeModal();loadRoute(state.mode);};$('#notThere').onclick=closeModal;}
function chooseLocation(){showModal('Wo bist du gerade?','<p class="modal-description">Bestätige deinen Standort.</p><select id="currentSelect" class="location-select" aria-label="Dein Standort">'+Object.entries(state.config.nodes).map(([id,node])=>'<option value="'+id+'" '+(id===state.current?'selected':'')+'>'+escapeHTML(node.name)+'</option>').join('')+'</select>'+button('setLocation','Ja, ich bin an diesem Ort'),'Wo bist du gerade? Wähle deinen Standort und bestätige ihn.','KEINE LIVE-ORTUNG');$('#setLocation').onclick=()=>{state.current=$('#currentSelect').value;closeModal();loadRoute(state.mode);};}
function openSign(key){const sign=SIGNS[key];showModal(sign.title,'<div class="big-sign '+sign.color+'">'+icon(sign.icon)+'</div><p class="modal-description">'+sign.text+'</p>'+actions(button('showSignSteps','Zeig es mir in Schritten','soft-button')),sign.title+'. '+sign.text,'ZEICHEN AUF DEINEM WEG');$('#showSignSteps').onclick=()=>showSteps(sign.title,sign.steps,0,'LERNBEISPIEL');}
function showSteps(title,steps,index=0,note=''){const step=steps[index];showModal(title,'<div class="single-step"><p class="eyebrow">SCHRITT '+(index+1)+' VON '+steps.length+'</p>'+icon(step[0])+'<h3>'+step[1]+'</h3></div><div class="step-dots">'+steps.map((s,i)=>'<span class="'+(i===index?'active':'')+'"></span>').join('')+'</div>'+(note?'<p class="modal-note">'+escapeHTML(note)+'</p>':'')+'<div class="step-buttons">'+(index>0?button('prevStep','Zurück','soft-button'):'')+button('nextStep',index===steps.length-1?'Fertig':'Nächster Schritt')+'</div>','Schritt '+(index+1)+'. '+step[1]+'. '+(index===steps.length-1?'Geschafft.':'Möchtest du den nächsten Schritt sehen?'),'SCHRITT FÜR SCHRITT');if($('#prevStep'))$('#prevStep').onclick=()=>showSteps(title,steps,index-1,note);$('#nextStep').onclick=()=>index===steps.length-1?closeModal():showSteps(title,steps,index+1,note);}
function showTask(room){showSteps(room.task,room.steps,0,room.taskNote||'Beispiel-Aufgabe. Beachte die Einweisung vor Ort.');}
function openRoom(room){showModal(room.name,'<p class="modal-description">Was möchtest du wissen?</p><div class="vertical-menu"><button id="roomSigns">'+icon('eye')+'Sicherheitszeichen</button><button id="roomTask">'+icon('parts')+'Meine Aufgabe</button><button id="roomFire">'+icon('fire')+'Wo ist der Feuerlöscher?</button></div>',room.name+'. Was möchtest du wissen? Sicherheitszeichen, die Aufgabe oder den Standort des Feuerlöschers?','DEIN ARBEITSBEREICH');$('#roomSigns').onclick=()=>{showModal('Welches Zeichen?','<div class="vertical-menu">'+room.signs.map(key=>{const sign=SIGNS[key];return '<button data-room-sign="'+key+'"><span class="sign-choice '+sign.color+'">'+icon(sign.icon)+'</span>'+sign.title+'</button>';}).join('')+'</div>','Welches Zeichen möchtest du erklärt bekommen?','SICHERHEITSZEICHEN');document.querySelectorAll('[data-room-sign]').forEach(b=>b.onclick=()=>openSign(b.dataset.roomSign));};$('#roomTask').onclick=()=>showTask(room);$('#roomFire').onclick=()=>showModal('Wo ist der Feuerlöscher?','<div class="big-sign fire">'+icon('fire')+'</div><p class="modal-description">'+room.fire+'</p><p class="modal-note">Vorgeschlagener Standort. Vor Ort bestätigen. Zugang frei halten.</p>',room.fire+' Das ist ein vorgeschlagener Standort. Bitte vor Ort bestätigen. Halte den Zugang frei.','STANDORT-VORSCHLAG');}
function newId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=crypto.getRandomValues(new Uint8Array(1))[0]%16;return(c==='x'?n:(n&3)|8).toString(16);});}
function openHelp(reason='general'){
  const requestId=newId();showModal('Soll ich Unterstützung holen?','<div class="big-sign green">'+icon('help')+'</div><p class="modal-description">Eine Assistenz kann dir helfen.</p><p class="modal-note">Gemeldeter Standort: '+escapeHTML(nodeName(state.current))+'</p>'+actions(button('sendHelp','Ja, Assistenz rufen','solid-button','bell'))+'<p id="helpStatus" class="modal-note" role="status"></p>','Soll ich Unterstützung holen? Deine Nachricht geht an die lokale Assistenz-Ansicht.','HILFE HOLEN');
  $('#sendHelp').onclick=async()=>{const b=$('#sendHelp');b.disabled=true;try{const response=await fetch('/api/help',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId,room:state.profile?.room||'assembly',location:state.current,reason})});if(!response.ok)throw new Error();if(!$('#modal').open||!document.body.contains(b))return;b.textContent='Nachricht gesendet';$('#helpStatus').textContent='Noch nicht bestätigt. Wenn niemand reagiert, sprich bitte eine Person vor Ort an.';speak('Die Nachricht ist gesendet, aber noch nicht bestätigt. Wenn niemand reagiert, sprich bitte eine Person vor Ort an.');state.helpPoll=setInterval(async()=>{try{const r=await fetch('/api/help/'+requestId);if(!r.ok)throw new Error();const data=await r.json();if(!$('#helpStatus'))return;if(data.status==='acknowledged'||data.status==='resolved'){$('#helpStatus').textContent=data.status==='acknowledged'?'Die Assistenz hat deine Nachricht bestätigt.':'Die Anfrage wurde abgeschlossen.';speak($('#helpStatus').textContent);clearInterval(state.helpPoll);}}catch(e){if($('#helpStatus'))$('#helpStatus').textContent='Verbindung unterbrochen. Bitte sprich eine Person vor Ort an.';}},3000);}catch(e){if(!document.body.contains(b))return;b.disabled=false;$('#helpStatus').textContent='Nicht gesendet. Bitte sprich eine Person vor Ort an.';speak('Die Nachricht konnte nicht gesendet werden. Bitte sprich eine Person vor Ort an.');}};
}
hydrate();$('#sound').innerHTML=icon('speaker');renderWelcome();
Promise.all([fetch('/api/companion').then(r=>{if(!r.ok)throw new Error();return r.json();}),fetch('/api/status').then(r=>r.json())]).then(([config,status])=>{state.config=config;state.source=status.camera_source;state.speechSource=status.speech_source;}).catch(()=>toast('Bitte starte den Python-Dienst neu. Der Schichtplan konnte nicht geladen werden.'));
window.addEventListener('pagehide',()=>{stopCamera();stopSpeech();clearInterval(state.helpPoll);});

