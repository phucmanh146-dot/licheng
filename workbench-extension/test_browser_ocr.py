"""Local Windows browser verification using only synthetic image/stream fixtures.
No desktop capture, permission approval, real chat search, or model request.
"""
import io
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright, expect

image = Image.new('RGB', (900, 600), 'white')
font = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 48)
ImageDraw.Draw(image).text((50, 80), 'RAG 学习资料\n先核对来源，再整理任务', fill='black', font=font, spacing=35)
buffer = io.BytesIO(); image.save(buffer, 'PNG')
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True, timeout=25000)
    try:
        page = browser.new_page()
        errors = []; page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:8877/index.html')
        page.wait_for_function('window.SY && window.SYGrowth')
        page.evaluate("SY.enterApp('OCR验证空间','qa-ocr-fixture'); SYGrowth.open({text:'原始笔记'});")
        page.wait_for_function("document.querySelector('.growth-dialog [data-status]').textContent.includes('已连接')")
        dialog = page.locator('.growth-dialog')
        dialog.locator('input[type=file]').set_input_files({'name': 'synthetic-ocr.png', 'mimeType': 'image/png', 'buffer': buffer.getvalue()})
        dialog.locator('[data-ocr]').wait_for()
        dialog.locator('[data-ocr]').click()
        dialog.get_by_text('核对画面文字', exact=True).wait_for(timeout=35000)
        material = dialog.locator('[data-materials]').text_content()
        assert 'RAG学习资料' in re.sub(r'\s+', '', material)
        checks.append('actual-local-ocr-on-synthetic-image'); print('OCR image passed', flush=True)
        dialog.get_by_text('追加到正文', exact=True).click()
        body = dialog.locator('[name=text]').input_value()
        assert body.startswith('原始笔记') and 'RAG学习资料' in re.sub(r'\s+', '', body)
        checks.append('ocr-to-body-preserves-original-text')
        page.evaluate('SYGrowth.close()')
        page.locator('#syRemoteEntry').click()
        panel = page.frame_locator('iframe[title="本机远程桌面"]')
        panel.locator('#shareWechat').wait_for(timeout=15000)
        frame = next(f for f in page.frames if f.url.startswith('http://127.0.0.1:8878/'))
        assert frame.evaluate("typeof navigator.mediaDevices.getDisplayMedia === 'function' && document.featurePolicy.allowsFeature('display-capture')")
        assert panel.locator('#searchShared').is_disabled()
        checks.append('share-entry-and-iframe-permission-policy')
        output=Path(__file__).parent/'test-output';output.mkdir(exist_ok=True)
        preview_page=browser.new_page(viewport={'width':1280,'height':1050})
        preview_page.goto('http://127.0.0.1:8878/')
        assert preview_page.evaluate('() => !!window.SYWechatLists')
        preview_page.screenshot(path=str(output/'wechat-follow-page.png'),full_page=True)
        preview_page.close()
        # All share input and WeChat list replies below are synthetic fixtures.
        pending_events = []
        followed={'keyword':'RAG','contacts':[{'name':'测试联系人'}],'messages':[{'text':'跟随测试第一条'},{'text':'跟随测试第二条'}]}
        page.route('**/wechat-screen-follow',lambda route:route.fulfill(json=followed))
        opened=[]
        def open_fixture(route):
            opened.append(route.request.post_data_json)
            route.fulfill(json={'ok':True,'name':'测试联系人','kind':'contact'})
        page.route('**/wechat-screen-open',open_fixture)
        page.route('**/wechat-float-start', lambda route: route.fulfill(json={'id':'fixture-float','ok':True}))
        page.route('**/wechat-float-poll', lambda route: route.fulfill(json={'events':[pending_events.pop(0)] if pending_events else []}))
        page.route('**/wechat-float-stop', lambda route: route.fulfill(json={'ok':True}))
        frame.evaluate('''() => {
          const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0,0,900,600);
          ctx.fillStyle = 'black'; ctx.font = '40px sans-serif'; ctx.fillText('RAG fixture',80,100);
          ctx.fillText('OUTSIDE SENTINEL',80,480);
          const stream = canvas.captureStream(5), track = stream.getVideoTracks()[0];
          Object.defineProperty(track, 'label', {value:'window:123:0'});
          track.getSettings = () => ({displaySurface:'window'});
          navigator.mediaDevices.getDisplayMedia = async () => stream;
          window.ocrFixtureStream = stream;
          window.ocrFixtureCanvas = canvas;
        }''')
        panel.locator('#shareWechat').click()
        page.wait_for_function("document.querySelector('dialog[data-minimized=true]')")
        assert frame.evaluate("ocrFixtureStream.getVideoTracks()[0].readyState === 'live'")
        page.get_by_text('返回消息列表',exact=True).click()
        checks.append('collapse-keeps-sharing-live')
        panel.locator('input[data-message-index="0"]').wait_for(timeout=15000)
        panel.locator('input[data-message-index="0"]').check()
        followed={'keyword':'新关键词','contacts':[{'name':'测试联系人'}],'messages':[{'text':'刷新后的另一条消息'}]}
        frame.evaluate("() => {const c=ocrFixtureCanvas.getContext('2d');c.fillStyle='green';c.fillRect(800,540,80,40);}")
        panel.locator('#resultQuery').filter(has_text='新关键词').wait_for(timeout=15000)
        assert panel.locator('#selectedCount').inner_text()=='1'
        panel.locator('#selectionSummary').click()
        assert '跟随测试第一条' in panel.locator('#chosenResults').inner_text()
        checks.append('follow-updates-results-and-preserves-checked-content')
        panel.locator('#followResults').uncheck()
        panel.get_by_text('打开聊天',exact=True).click()
        page.wait_for_function("document.querySelector('dialog[data-minimized=true]')")
        assert len(opened)==1 and opened[0]['name']=='测试联系人' and opened[0]['keyword']=='新关键词'
        assert opened[0]['image'].startswith('data:image/png;base64,')
        page.get_by_text('返回消息列表',exact=True).click()
        checks.append('contact-action-uses-current-shared-window')
        panel.locator('#clearChosen').click()
        panel.locator('#cropShared').click()
        canvas=panel.locator('#sharedCropCanvas');canvas.scroll_into_view_if_needed();box=canvas.bounding_box()
        page.mouse.move(box['x']+40*box['width']/900,box['y']+40*box['height']/600)
        page.mouse.down();page.mouse.move(box['x']+600*box['width']/900,box['y']+200*box['height']/600);page.mouse.up()
        panel.locator('#confirmSharedCrop').click()
        panel.locator('#results').get_by_text('微信框选文字（请核对识别结果）：',exact=False).wait_for(timeout=35000)
        crop_text=panel.locator('#results').inner_text()
        assert 'RAG' in crop_text and 'OUTSIDE' not in crop_text
        assert panel.locator('#importChosen').is_disabled()
        checks.append('crop-only-visible-selection-with-no-default-import')
        pending_events.append({'type':'stop'})
        expect(panel.locator('#stopShared')).to_be_disabled(timeout=8000)
        assert frame.evaluate("() => ocrFixtureStream.getTracks().every(t=>t.readyState==='ended')")
        checks.append('native-stop-event-ends-share')
        page.route('**/wechat-group-list',lambda route:route.fulfill(json={'groups':[{'id':'group-fixture','name':'测试学习群'}],'messages':[],'conversations':[]}))
        requests=[]
        def group_messages(route):
            requests.append(route.request.post_data_json)
            route.fulfill(json={'groups':[],'messages':[{'text':'RAG 第一条资料','group':'测试学习群'},{'text':'RAG 第二条不选','group':'测试学习群'}],'conversations':[]})
        page.route('**/wechat-group-messages',group_messages)
        panel.locator('#groupQuery').fill('学习');panel.locator('#keyword').fill('RAG');panel.locator('#search').click()
        panel.get_by_text('选择此群',exact=True).click()
        panel.locator('input[data-message-index="1"]').wait_for()
        assert requests==[{'id':'group-fixture','keyword':'RAG','session':None}]
        panel.locator('input[data-message-index="0"]').check()
        panel.locator('#importChosen').click()
        page.locator('.growth-dialog [name=text]').wait_for()
        imported=page.locator('.growth-dialog [name=text]').input_value()
        assert '第一条资料' in imported and '第二条不选' not in imported
        checks.append('select-group-then-import-only-checked-message')
        assert errors == [], errors
        print(json.dumps({'ok': True, 'checks': checks, 'realWeChatVerified': False}, ensure_ascii=True))
    finally:
        browser.close()
