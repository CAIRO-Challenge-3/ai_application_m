"""Local browser integration checks. Uses fake camera and mocked inference only."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

out = Path('test-artifacts')
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True,
        args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    context = browser.new_context(viewport={'width':1280,'height':900}, permissions=['camera'])
    context.add_init_script("window.__spoken=[]; speechSynthesis.speak=function(u){window.__spoken.push(u.text)}; speechSynthesis.cancel=function(){};")
    page = context.new_page()
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:5055')
    page.screenshot(path=str(out/'home.png'), full_page=True)
    # Every room has three speaking symbol explanations, a task and a proposed fire location.
    for room_id in ['assembly', 'wood', 'dining', 'sanitary', 'support']:
        page.locator('[data-action=rooms]:visible').first.click()
        page.locator('[data-room='+room_id+']').click()
        buttons=page.locator('#roomSigns button')
        assert buttons.count()==3
        for i in range(3):
            before=page.evaluate('window.__spoken.length')
            buttons.nth(i).click()
            assert page.evaluate('window.__spoken.length')>before
            page.locator('#repeatVoice').click()
            assert page.evaluate('window.__spoken.length')>before+1
            page.locator('#closeModal').click()
        page.locator('#taskButton').click()
        assert 2<=page.locator('.visual-step').count()<=3
        page.locator('#closeModal').click()
        page.locator('#fireButton').click()
        assert 'Vorschlag' in page.locator('#modalBody').inner_text()
        page.locator('#closeModal').click()
    page.locator('[data-action=rooms]:visible').first.click()
    page.locator('[data-room=wood]').click()
    assert page.locator('#roomSigns button').count()==3
    page.locator('[data-sign=glasses]').click()
    assert page.locator('#modal').is_visible()
    assert page.locator('.visual-step').count()==2
    page.locator('#closeModal').click()
    page.locator('#escapeButton').click()
    assert page.locator('.plan polyline').count()==2
    page.screenshot(path=str(out/'escape.png'), full_page=True)
    page.locator('#zoomIn').click()
    assert page.locator('.plan').evaluate('(el)=>el.style.width')=='140%'
    page.locator('#closeModal').click()
    page.screenshot(path=str(out/'room.png'), full_page=True)
    page.locator('[data-action=home]').first.click()
    page.locator('[data-action=before]').click()
    attempts=[0]
    def detection(route):
        attempts[0]+=1
        passed=attempts[0]>=3
        payload={'width':640,'height':480,'detections':[], 'assessment':{'passed':passed,'person_ok':True,'person_count':1,'checks':[{'key':'helmet','state':'seen','name':'Helm'},{'key':'gloves','state':'seen' if passed else 'missing','name':'Handschuhe'}]}}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))
    page.route('**/api/detect', detection)
    page.locator('#startCheck').click()
    page.wait_for_function("document.querySelector('#checkResult').textContent.includes('Schauen wir noch einmal')",timeout=20000)
    assert page.locator('#checkHelp').is_hidden()
    page.locator('#retryCheck').click()
    page.wait_for_function("document.querySelector('#checkResult').textContent.includes('Unterstützung')")
    assert page.locator('#checkHelp').is_visible()
    page.screenshot(path=str(out/'check-retry.png'), full_page=True)
    page.locator('#checkHelp').click()
    page.locator('#sendHelp').click()
    page.wait_for_function("document.querySelector('#helpStatus').textContent.includes('Noch nicht bestätigt')")
    item=page.request.get('http://127.0.0.1:5055/api/help').json()[0]
    page.request.patch('http://127.0.0.1:5055/api/help/'+item['id'], data={'status':'acknowledged'})
    page.wait_for_function("document.querySelector('#helpStatus').textContent.includes('hat deine Nachricht bestätigt')",timeout=10000)
    page.request.patch('http://127.0.0.1:5055/api/help/'+item['id'], data={'status':'resolved'})
    page.locator('#closeModal').click()
    page.locator('#retryCheck').click()
    page.wait_for_function("document.querySelector('#goWork').classList.contains('hidden') === false")
    page.locator('#goWork').click()
    assert page.locator('#arrived').is_visible()
    page.locator('#arrived').click()
    assert page.locator('#roomName').inner_text()=='Holzbearbeitung'
    page.set_viewport_size({'width':390,'height':844})
    page.locator('[data-action=home]').first.click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(out/'mobile.png'), full_page=True)
    assert not errors, errors
    print('PASS: signs, steps, route, zoom, camera flow, second-failure help, help delivery/ack, pass navigation, mobile overflow, no JS errors')
    browser.close()
