from pathlib import Path
p=Path('static/app.js')
s=p.read_text(encoding='utf-8-sig')
s=s.replace("}catch(e){button.disabled=false;$('#helpStatus')", "}catch(e){if(!document.body.contains(button))return;button.disabled=false;$('#helpStatus')")
p.write_text(s,encoding='utf-8')
