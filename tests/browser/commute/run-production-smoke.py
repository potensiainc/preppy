"""Chromium viewport emulation, not a real-device certification."""
import os
import mimetypes
import json
from urllib.parse import urlsplit,unquote
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE_URL=os.environ.get('COMMUTE_SMOKE_BASE_URL','http://127.0.0.1:3312')
OUTPUT=Path(os.environ.get('COMMUTE_SMOKE_OUTPUT','test-results/schoolmap'))
OUTPUT.mkdir(parents=True,exist_ok=True)
def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')<=1
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,timeout=20000)
    errors=[]
    def local_files(route):
        path=unquote(urlsplit(route.request.url).path)
        if path=='/schoolmap':path='/commute/index.html'
        root=Path(__file__).resolve().parents[3]/'public'
        file=(root/path.lstrip('/')).resolve()
        if not file.is_relative_to(root.resolve()) or not file.is_file():
            route.fulfill(status=404,body='Not found');return
        route.fulfill(status=200,body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
    def configure(page,block_map=True):
        if os.environ.get('COMMUTE_SMOKE_LOCAL_FILES')=='1':page.route(f'{BASE_URL}/**',local_files)
        if block_map:page.route('**/vendor/maplibre-gl.js',lambda route:route.abort())
    for width,height in [(360,800),(390,844),(430,932),(844,390),(1440,900)]:
        page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
        page.on('pageerror',lambda e:errors.append(str(e)))
        configure(page)
        page.goto(f'{BASE_URL}/schoolmap')
        page.locator('.school-card').first.wait_for()
        assert page.locator('.school-card').count()==38
        assert page.locator('.wordmark').text_content()=='preppy.'
        assert page.locator('.wordmark').get_attribute('href')=='/'
        assert '전체' in page.locator('#current-scope').inner_text()
        no_overflow(page)
        page.screenshot(path=str(OUTPUT/f'list-{width}.png'))
        if width<=760:
            page.evaluate('window.scrollTo(0,1000)')
            assert page.locator('#search').bounding_box()['y']>=0
            assert page.locator('#search').bounding_box()['y']<180
            page.evaluate('window.scrollTo(0,0)')
        page.locator('.heart-button').first.click()
        assert '이 브라우저' in page.locator('#toast').inner_text()
        page.reload();page.locator('.school-card').first.wait_for()
        assert page.locator('.heart-button.saved').count()==1
        page.locator('#search').fill('목동')
        assert page.locator('.search-result').count()>12
        assert '목1동' in page.locator('#search-results').inner_text()
        assert '등교' in page.locator('#search-results').inner_text()
        page.locator('#search').press('ArrowDown')
        assert page.locator('.search-result').first.evaluate('e=>e===document.activeElement')
        page.keyboard.press('Escape')
        page.locator('#search').fill('')
        page.locator('.school-open').first.click()
        page.locator('#school-detail').wait_for(state='visible')
        assert '적용 학년 미확인' in page.locator('.detail-scope').inner_text()
        no_overflow(page)
        if width<=760:page.locator('.mobile-detail-action').click()
        options=page.locator('#detail-route option').evaluate_all('items=>items.map(o=>o.value).filter(Boolean)')
        if options:
            page.locator('#detail-route').select_option(options[0])
            page.locator('.stop-row').first.wait_for(state='visible')
            page.locator('.stop-row').first.click()
            page.locator('.desktop-detail-action').click()
            page.screenshot(path=str(OUTPUT/f'precomparison-{width}.png'))
            page.locator('[data-action="compare-open"]').click()
            assert page.locator('.compare-stop').count()==1
            assert '적용 학년' in page.locator('#compare-content').inner_text()
            assert '시간 미확인' in page.locator('#compare-content').inner_text()
            page.screenshot(path=str(OUTPUT/f'comparison-{width}.png'),full_page=True)
            page.locator('[data-close="compare-dialog"]').click()
            url=page.url
            page.reload();page.locator('#school-detail').wait_for(state='visible')
            assert page.url==url
            assert page.locator('#detail-route').input_value()==options[0]
            assert page.locator('.stop-row.active').count()==1
        page.screenshot(path=str(OUTPUT/f'timetable-{width}.png'),full_page=True)
        no_overflow(page)
        page.close()
    page=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
    configure(page)
    page.goto(f'{BASE_URL}/schoolmap?area=강북구&school=kyonggi&scope=all')
    page.locator('.scope-warning').wait_for(state='visible')
    page.locator('[data-action="retry-map"]').wait_for(state='visible')
    assert not page.locator('.map-actions').is_visible()
    assert page.locator('.mobile-detail-action').is_visible()
    page.screenshot(path=str(OUTPUT/'map-unavailable-mismatch-390.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':420})
    page.locator('#search').fill('경기')
    page.locator('#search').press('ArrowDown')
    page.keyboard.press('Enter')
    no_overflow(page)
    page.screenshot(path=str(OUTPUT/'keyboard-viewport-390.png'),full_page=True)
    # Storage denial must preserve a usable session without claiming durable saves.
    page=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
    configure(page)
    page.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked storage fixture')}})")
    page.goto(f'{BASE_URL}/schoolmap');page.locator('.heart-button').first.click()
    assert '현재 화면에서만' in page.locator('#toast').inner_text()
    page.reload();page.locator('.school-card').first.wait_for()
    assert page.locator('.heart-button.saved').count()==0
    # Successful local WebGL map with external background intentionally unavailable.
    page=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
    page.on('pageerror',lambda e:errors.append(str(e)))
    configure(page,block_map=False)
    page.route('https://tiles.openfreemap.org/**',lambda route:route.abort())
    page.goto(f'{BASE_URL}/schoolmap')
    page.locator('.school-card').first.wait_for()
    assert page.locator('#map canvas').count()==0 # mobile list does not initialize WebGL
    page.locator('#mobile-view-toggle').click()
    page.locator('#map canvas').wait_for(state='visible')
    assert page.locator('#search').is_visible()
    assert page.locator('#mobile-view-toggle').get_attribute('aria-pressed')=='true'
    page.screenshot(path=str(OUTPUT/'map-local-390.png'))
    page.locator('#mobile-view-toggle').click()
    assert page.locator('.school-card').first.is_visible()
    page.screenshot(path=str(OUTPUT/'list-after-map-390.png'))
    page.goto(f'{BASE_URL}/schoolmap?area=강북구&school=kyonggi&scope=all')
    page.locator('#map canvas').wait_for(state='visible')
    page.locator('.scope-warning').wait_for(state='visible')
    assert page.locator('#search').is_visible()
    page.screenshot(path=str(OUTPUT/'map-sheet-mismatch-390.png'))
    page.locator('.mobile-detail-action').click()
    assert page.locator('.route-list').is_visible()
    no_overflow(page)
    # Synthetic evidence fixture validates presentation; it is never shipped as research.
    page=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
    configure(page)
    evidence={'schemaVersion':1,'records':[{'schoolId':'kyonggi','field':'TEST FIXTURE','sourceUrl':'https://school.example/test','verificationStatus':'conflicting','sourcePublicationDate':'2026-09-02','documentDate':'2025-09-01','attachmentRevisionDate':'2026-09-15','effectiveSchoolYear':'2027','operatingStatus':'TEST 예정','conditions':['TEST 적용 조건 전체 문장'],'conflicts':['TEST 날짜가 달라요.']}]}
    page.route('**/commute/provenance.json',lambda route:route.fulfill(content_type='application/json',body=json.dumps(evidence)))
    page.goto(f'{BASE_URL}/schoolmap?school=kyonggi')
    page.locator('.field-sources summary').click()
    text=page.locator('.field-sources').inner_text()
    for expected in ['2026-09-02','2025-09-01','2026-09-15','2027','TEST 적용 조건 전체 문장','TEST 날짜가 달라요.']:assert expected in text
    page.screenshot(path=str(OUTPUT/'evidence-synthetic-fixture-390.png'),full_page=True)
    browser.close()
    assert not errors,errors
print(f'PASS: five emulated viewports, reload saves, search, keyboard navigation, comparison, URL restore, map failure. Screenshots: {OUTPUT}')
