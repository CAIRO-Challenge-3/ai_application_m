"""Companion interaction tests: fake camera/inference, real navigation/help APIs."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

out = Path('test-artifacts'); out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True,
        args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    context=browser.new_context(viewport={'width':1280,'height':850}, permissions=['camera'])
    context.add_init_script('''
      window.__spoken=[]; window.__cameraCalls=0;
      speechSynthesis.speak=u=>window.__spoken.push(u.text); speechSynthesis.cancel=()=>{};
      navigator.mediaDevices.getUserMedia=async()=>{
        window.__cameraCalls++;
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#54626e';ctx.fillRect(0,0,640,480);
        const stream=canvas.captureStream(10);
        const timer=setInterval(()=>{if(stream.getTracks()[0].readyState==='ended'){clearInterval(timer);return;}ctx.fillRect(0,0,640,480);},100);
        return stream;
      };
      Element.prototype.requestFullscreen=()=>Promise.resolve();
    ''')
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda msg: print('Browser:',msg.text,flush=True) if msg.type=='warning' else None)
    page.goto('http://127.0.0.1:5055')
    page.wait_for_function('state.config !== null')
    page.screenshot(path=str(out/'companion-welcome.png'),full_page=True)
    requests=[]; result_mode=['fail-once']
    def detection(route):
        requests.append(1)
        passed=result_mode[0]=='fail-once' and len(requests)>1
        route.fulfill(status=200,content_type='application/json',body=json.dumps({'detections':[],'width':640,'height':480,
            'assessment':{'passed':passed,'person_count':1,'person_ok':True,'checks':[
                {'key':'helmet','name':'Helm','state':'seen'},
                {'key':'gloves','name':'Handschuhe','state':'seen' if passed else 'missing'}]}}))
    page.route('**/api/detect',detection)
    page.locator('#welcome').click();page.locator('[data-profile=demo-alex]').click()
    assert page.evaluate('window.__cameraCalls')==0
    page.screenshot(path=str(out/'companion-ready.png'),full_page=True)
    page.locator('#notReady').click()
    assert page.evaluate('window.__cameraCalls')==0
    page.locator('#readyAgain').click();page.locator('#yesCheck').click()
    page.wait_for_selector('#reinspect')
    count=page.evaluate('window.__spoken.length')
    page.wait_for_timeout(1800)
    assert len(requests)==1 and page.evaluate('window.__spoken.length')==count
    assert page.evaluate('state.stream === null')
    assert page.locator('#failedHelp').count()==0
    page.screenshot(path=str(out/'companion-reinspect.png'),full_page=True)
    page.locator('#reinspect').click()
    page.wait_for_selector('#showWorkRoute')
    assert page.locator('.plant-map').count()==0
    assert 'Alex' in page.locator('h1').inner_text()
    page.locator('#showWorkRoute').click();page.wait_for_selector('.plant-map')
    assert page.evaluate('state.route.path[0]')=='reception'
    assert page.evaluate('state.route.destination')=='assembly'
    assert page.locator('.route-line.exit-route').count()==0
    assert set(page.locator('[data-sign]').evaluate_all('(els)=>els.map(e=>e.dataset.sign)'))=={'aid','noSmoke','trip','gloves'}
    page.screenshot(path=str(out/'companion-map.png'),full_page=True)
    page.locator('[data-sign=gloves]').focus();page.keyboard.press('Enter')
    assert page.locator('#modalTitle').inner_text()=='Handschuhe tragen'
    assert 'Handschuhe' in page.evaluate('window.__spoken.at(-1)')
    page.locator('#closeModal').click()
    page.locator('#mapNext').click()
    assert page.evaluate('state.current')=='reception'
    page.locator('#notThere').click();assert page.evaluate('state.current')=='reception'
    page.locator('#mapNext').click();page.locator('#confirmWaypoint').click()
    page.wait_for_function("state.current==='hub' && state.view==='map'")
    page.locator('#location').click();page.locator('#currentSelect').select_option('wood');page.locator('#setLocation').click()
    page.wait_for_function("state.route.path[0]==='wood' && state.view==='map'")
    page.locator('#exitButton').click();page.wait_for_selector('.exit-route',state='attached')
    assert page.evaluate('state.route.path[0]')=='wood'
    assert page.evaluate('state.route.destination')=='exit_main'
    page.screenshot(path=str(out/'companion-exit.png'),full_page=True)
    # Every room still exposes three symbols, one-step-at-a-time tasks and equipment guidance.
    for room in ['assembly','wood','dining','sanitary','support']:
        page.locator('[data-room='+room+']').focus();page.keyboard.press('Enter')
        page.locator('#roomSigns').click();assert page.locator('[data-room-sign]').count()==3
        page.locator('[data-room-sign]').first.click();assert page.locator('.big-sign').is_visible()
        page.locator('#closeModal').click()
        page.locator('[data-room='+room+']').focus();page.keyboard.press('Enter')
        page.locator('#roomTask').click();assert page.locator('.single-step').count()==1
        page.locator('#nextStep').click();assert 'SCHRITT 2' in page.locator('.single-step').inner_text()
        page.locator('#closeModal').click()
        page.locator('[data-room='+room+']').focus();page.keyboard.press('Enter')
        page.locator('#roomFire').click();assert 'Vorschlag' in page.locator('#modalBody').inner_text()
        page.locator('#modalExit').click();page.wait_for_selector('.exit-route',state='attached')
    # A second unsuccessful inspection exposes an actual local help request.
    page.locator('#restart').click();page.locator('#confirmReset').click()
    result_mode[0]='always-fail';requests.clear()
    page.locator('#welcome').click();page.locator('[data-profile=demo-alex]').click();page.locator('#yesCheck').click()
    page.wait_for_selector('#reinspect');page.locator('#reinspect').click();page.wait_for_selector('#failedHelp')
    page.locator('#failedHelp').click();page.locator('#sendHelp').click()
    page.wait_for_function("document.querySelector('#sendHelp').textContent==='Nachricht gesendet'")
    desk=context.new_page();desk.goto('http://127.0.0.1:5055/assistant')
    desk.get_by_role('button',name='Ich kümmere mich').first.click()
    page.wait_for_function("document.querySelector('#helpStatus').textContent.includes('bestätigt.')",timeout=10000)
    desk.get_by_role('button',name='Erledigt').first.click();desk.close()
    page.locator('#modalExit').click();page.wait_for_selector('.exit-route',state='attached')
    # Exit is available even before a successful safety check.
    assert page.evaluate('state.passed') is False
    page.locator('#restart').click();page.locator('#confirmReset').click()
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(out/'companion-mobile.png'),full_page=True)
    assert not errors,errors
    print('PASS: consent, no auto-retry, one notification, camera stopped, named assignment, waypoint confirmation, route signs, red exit, all room guidance, help/ack, mobile layout')
    browser.close()
