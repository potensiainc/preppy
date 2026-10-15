"""Isolated local-file browser emulation; never clears a user browser profile."""
import json,mimetypes,traceback,os
from pathlib import Path
from urllib.parse import urlsplit,unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3];BASE='http://schoolmap-explore.test';ENGINE=os.environ.get('COMMUTE_EXPLORE_ENGINE','chromium');OUT=ROOT/('test-results/exploratory-'+ENGINE);OUT.mkdir(parents=True,exist_ok=True)
results=[]
def local(route):
    path=unquote(urlsplit(route.request.url).path)
    if path=='/schoolmap':path='/commute/index.html'
    f=(ROOT/'public'/path.lstrip('/')).resolve()
    if not f.is_relative_to((ROOT/'public').resolve()) or not f.is_file():route.fulfill(status=404,body='missing');return
    route.fulfill(body=f.read_bytes(),content_type=mimetypes.guess_type(f)[0] or 'application/octet-stream')
def check(page):assert page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')<=1,'document overflow'
def route(page):
    page.locator('.school-open').first.click();page.locator('.mobile-detail-action').click()
    values=page.locator('#detail-route option').evaluate_all('a=>a.map(o=>o.value).filter(Boolean)');page.locator('#detail-route').select_option(values[0]);return values
with sync_playwright() as p:
    browser=getattr(p,ENGINE).launch(headless=True)
    def run(name,test):
        context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
        context.route(BASE+'/**',local);context.route('https://tiles.openfreemap.org/**',lambda r:r.abort());page=context.new_page();page.set_default_timeout(6000)
        try:test(context,page);results.append({'case':name,'engine':ENGINE,'version':browser.version,'status':'PASS'})
        except Exception as e:
            results.append({'case':name,'status':'FAIL','error':str(e),'traceback':traceback.format_exc()});page.screenshot(path=str(OUT/(name+'-FAIL.png')),full_page=True)
        finally:context.close();(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print(name,results[-1]['status'],results[-1].get('error','')[:200],flush=True)
    def stale(context,page):
        held=[];page.route('**/vendor/maplibre-gl.js',lambda r:held.append(r))
        page.goto(BASE+'/schoolmap');values=route(page);page.locator('.stop-row').nth(1).click();page.locator('[data-action="peek-route"]').click();page.wait_for_function('!!document.querySelector("script[src*=maplibre]")')
        page.locator('#detail-route').select_option(values[1]);page.locator('.stop-row').nth(3).click();before=page.url
        local(held[0]);page.locator('#map canvas').wait_for(state='visible');page.wait_for_timeout(300)
        assert page.url==before,{'before':before,'after':page.url};page.screenshot(path=str(OUT/'stale-map-selection.png'))
    run('stale-map-selection',stale)
    def same_route(context,page):
        held=[];page.route('**/vendor/maplibre-gl.js',lambda r:held.append(r));page.goto(BASE+'/schoolmap');route(page)
        page.locator('.stop-row').nth(1).click();page.locator('[data-action="peek-route"]').click();page.wait_for_function('!!document.querySelector("script[src*=maplibre]")')
        page.locator('.stop-row').nth(3).click();before=page.url;local(held[0]);page.locator('#map canvas').wait_for(state='visible');page.wait_for_timeout(300);assert page.url==before,{'before':before,'after':page.url}
    run('stale-map-same-route',same_route)
    def resize(context,page):
        page.goto(BASE+'/schoolmap');route(page);page.locator('.stop-row').nth(2).click();before=page.url
        for w,h in [(320,568),(780,360),(928,1004),(360,804),(484,1112),(1028,876),(320,568)]:
            page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(60);check(page);assert page.url==before
        page.screenshot(path=str(OUT/'continuous-resize-320.png'))
    run('continuous-resize',resize)
    def history(context,page):
        page.goto(BASE+'/schoolmap');route(page);page.locator('.stop-row').nth(1).click();first=page.url;page.locator('.stop-row').nth(2).click();second=page.url
        page.go_back();assert page.url==first;assert page.locator('.stop-row.active').get_attribute('data-stop')==urlsplit(first).query.split('stop=')[1].split('&')[0]
        page.go_forward();assert page.url==second;page.reload();assert page.url==second;assert page.locator('.stop-row.active').count()==1
    run('history-reload',history)
    def retry(context,page):
        hits=[]
        def script(r):
            hits.append(1)
            if len(hits)==1:r.abort()
            else:local(r)
        page.route('**/vendor/maplibre-gl.js',script);page.goto(BASE+'/schoolmap');page.locator('#mobile-view-toggle').click();page.locator('[data-action="retry-map"]').wait_for(state='visible');page.locator('[data-action="retry-map"]').click();page.locator('#map canvas').wait_for(state='visible');assert not page.locator('body').evaluate('e=>e.classList.contains("map-unavailable")');check(page)
    run('map-retry',retry)
    def empty(context,page):
        page.goto(BASE+'/schoolmap');page.locator('#search').fill('존재하지않는학교이름가나다라마바사'*8);assert page.locator('.search-result').count()==0;assert page.locator('.search-empty').is_visible();check(page);page.keyboard.press('Enter');assert page.locator('.school-card').count()==38
        page.locator('#search').fill('');page.locator('[data-action="saved"]').click();assert page.locator('.empty-state').is_visible();page.locator('.empty-state button').click();assert page.locator('.school-card').count()==38
    run('long-empty-search',empty)
    def storage(context,page):
        context.add_init_script('Storage.prototype.setItem=function(){throw new DOMException("denied","QuotaExceededError")}');page.goto(BASE+'/schoolmap');page.locator('.heart-button').first.click();assert '저장하지 못했어요' in page.locator('#toast').inner_text();assert page.locator('.heart-button.saved').count()==1;page.reload();assert page.locator('.heart-button.saved').count()==0
    run('storage-write-failure',storage)
    def storage_clear(context,page):
        page.goto(BASE+'/schoolmap');page.locator('.heart-button').first.click();other=context.new_page();other.goto(BASE+'/schoolmap');other.evaluate('localStorage.clear()');page.wait_for_timeout(200);assert page.locator('.heart-button.saved').count()==0,'other-tab clear left stale durable-save state';page.locator('.heart-button').nth(1).click();assert page.evaluate('JSON.parse(localStorage.getItem("preppy.schoolmap.saved.v1")).schoolIds.length')==1,'cleared IDs resurrected on next save'
    run('storage-clear-other-tab',storage_clear)
    def blank_enter(context,page):
        page.goto(BASE+'/schoolmap');page.locator('#search').fill('목동');page.locator('.search-result').nth(2).click();before=page.url
        assert page.locator('#search').input_value()=='';page.locator('#search').focus();page.keyboard.press('Enter');assert page.url==before,{'before':before,'after':page.url}
    run('blank-search-enter',blank_enter)
    def compare_scope(context,page):
        page.goto(BASE+'/schoolmap');page.locator('.compare-add').nth(0).click();page.locator('.compare-add').nth(1).click();page.locator('.compare-add').nth(2).click();page.locator('[data-action="compare-open"]').click()
        for select in page.locator('.compare-stop').all():
            value=select.locator('option').nth(1).get_attribute('value');select.select_option(value)
        assert '선택 전' not in page.locator('#compare-content').inner_text();page.locator('[data-close="compare-dialog"]').click()
        page.locator('[data-action="regions"]').first.click();page.locator('[data-region="강남구"]').click();page.locator('[data-action="compare-open"]').click()
        for select in page.locator('.compare-stop').all():
            value=select.input_value()
            if value:assert '강남구' in page.locator('#compare-content').inner_text()
        page.set_viewport_size({'width':320,'height':568});check(page);page.screenshot(path=str(OUT/'compare-320.png'))
    run('compare-scope-three-schools',compare_scope)
    def text_zoom(context,page):
        page.goto(BASE+'/schoolmap?school=yale');page.wait_for_load_state('networkidle');page.locator('.school-sources summary').first.click()
        page.evaluate("Array.from(document.querySelectorAll('#school-detail *')).filter(e=>!(e instanceof SVGElement)).map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]).forEach(([e,size])=>e.style.fontSize=(size*2)+'px')");page.set_viewport_size({'width':320,'height':568});check(page)
        link=page.locator('.school-sources a').first;link.scroll_into_view_if_needed();box=link.bounding_box();assert box['y']>=-1 and box['y']+box['height']<=569,{'unreachable enlarged source link':box};page.screenshot(path=str(OUT/'source-text-200percent-320.png'));page.locator('[data-action="close-school"]').click()
        check(page)
    run('long-source-text-200percent',text_zoom)
    def delayed_sources(context,page):
        held=[];page.route('**/research-sources.json',lambda r:held.append(r));page.goto(BASE+'/schoolmap');page.locator('.school-card').first.wait_for()
        target=page.locator('.school-open').nth(4);identity=target.get_attribute('data-id');target.focus();page.wait_for_timeout(80);local(held[0]);page.wait_for_timeout(250)
        assert page.evaluate('document.activeElement.dataset.id')==identity,'late source response discarded list keyboard focus'
    run('delayed-source-list-focus',delayed_sources)
    def map_cancel(context,page):
        held=[];page.route('**/vendor/maplibre-gl.js',lambda r:held.append(r));page.goto(BASE+'/schoolmap');route(page);page.locator('.stop-row').nth(1).click();page.locator('[data-action="peek-route"]').click();page.wait_for_function('!!document.querySelector("script[src*=maplibre]")')
        page.locator('#mobile-view-toggle').click();before=page.url;local(held[0]);page.wait_for_timeout(350)
        assert not page.locator('body').evaluate('e=>e.classList.contains("mobile-map")');assert page.url==before
    run('cancel-map-focus-before-load',map_cancel)
    def dialog_back(context,page):
        page.goto(BASE+'/schoolmap');page.locator('.compare-add').nth(0).click();page.locator('.compare-add').nth(1).click()
        for area in ['강남구','서초구']:
            page.locator('[data-action="regions"]').first.click();page.locator('[data-region="'+area+'"]').click()
        page.locator('[data-action="compare-open"]').click();assert '서초구' in page.locator('.comparison-scope').inner_text();page.go_back()
        assert not page.locator('#compare-dialog').evaluate('e=>e.open'),'history restored area but left stale comparison dialog open'
    run('history-closes-stale-comparison',dialog_back)
    def reopen_sheet(context,page):
        held=[];page.route('**/vendor/maplibre-gl.js',lambda r:held.append(r));page.goto(BASE+'/schoolmap');route(page)
        page.locator('.stop-row').nth(1).click();page.locator('[data-action="peek-route"]').click();page.wait_for_function('!!document.querySelector("script[src*=maplibre]")')
        page.locator('[data-action="route-summary"]').click();page.locator('[data-action="expand-route"]').click()
        local(held[0]);page.wait_for_timeout(350);assert page.locator('body').evaluate('e=>e.classList.contains("route-sheet-open")'),'late map response collapsed the reopened timetable'
    run('reopen-timetable-during-map-load',reopen_sheet)
    browser.close()

raise SystemExit(1 if any(row["status"]=="FAIL" for row in results) else 0)
