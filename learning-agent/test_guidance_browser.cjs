// Real Chromium + HTTP + temporary SQLite. Fixtures are hand authored, not model output.
const {spawn, execFileSync} = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'guidance-check-'));
const base = 'http://127.0.0.1:8927';
let server, browser;
const errors = [], checks = [];
async function state(id) {return (await fetch(base + '/api/agent/team?id=' + id)).json();}

(async () => {
  try {
    server = spawn('python', ['learning_agent_server.py', '--port', '8927'], {
      cwd: __dirname, env: {...process.env, SHANGAN_AGENT_DATA: temp}, stdio: 'ignore'
    });
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {if ((await fetch(base + '/api/agent/team')).ok) {ready = true; break;}} catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ready, 'temporary server did not start');
    const fixtures = JSON.parse(execFileSync('python', ['-X', 'utf8', '-c',
      "import json; from test_guidance import diagnosis_fixture,plan_fixture; p={'goal':'人工测试目标'}; d=diagnosis_fixture(p); print(json.dumps({'diagnosis':d,'plan':plan_fixture(d,p)},ensure_ascii=False))"
    ], {cwd: __dirname, encoding: 'utf8'}));
    const {diagnosis, plan} = fixtures;
    // Exercise untrusted text and a disallowed link without executing either.
    diagnosis.sources[0].url = 'javascript:window.__unsafe=1';
    plan.tasks[0].micro_steps[0].reason = '<img src=x onerror="window.__unsafe=1"> 人工安全测试';
    browser = await chromium.launch({headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox']});
    const page = await browser.newPage({viewport: {width: 1365, height: 1000}});
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/team.html');
    await page.locator('#goal').fill('比赛任务精细指导 · 人工浏览器夹具');
    await page.locator('#mode').selectOption('live');
    await page.locator('#create button').click();
    await page.getByText('A：待接入 / B：待接入', {exact: true}).waitFor();
    assert.equal(await page.locator('#dispatch-run').isDisabled(), true);
    checks.push('live-provider-boundary');

    await page.getByText('接收 A 的 JSON 交付', {exact: true}).click();
    await page.locator('#diagnosis-json').fill(JSON.stringify(diagnosis));
    await page.locator('#diagnosis-form button').click();
    await page.locator('#diagnosis .gap-card').waitFor();
    assert.ok((await page.locator('#diagnosis').innerText()).includes('说明文档第2节「结果」第一段'));
    assert.ok((await page.locator('#diagnosis').innerText()).includes('测试说明文档 · v1'));
    checks.push('diagnosis-evidence-location-version');

    await page.getByText('接收 B 的 JSON 交付', {exact: true}).click();
    const invalid = structuredClone(plan);
    invalid.tasks[0].micro_steps[0].input_version.artifact_version = 99;
    await page.locator('#plan-json').fill(JSON.stringify(invalid));
    await page.locator('#reason').fill('人工测试：校验版本引用');
    await page.locator('#plan-form button').click();
    await page.getByText('引用了未登记的材料版本；请 A 补齐 artifact_versions', {exact: true}).waitFor();
    assert.equal(await page.locator('#apply').isDisabled(), true);
    checks.push('unregistered-version-rejected');

    await page.locator('#plan-json').fill(JSON.stringify(plan));
    await page.locator('#plan-form button').click();
    await page.locator('#apply:enabled').waitFor();
    const id = await page.locator('#projects').inputValue();
    let saved = await state(id);
    assert.equal(saved.plan, null);
    const preview = await page.locator('#proposal').innerText();
    for (const field of ['操作位置', '这样做的原因', '这一步交付', '自检方法', '卡住时下一步', '能力依据'])
      assert.ok(preview.includes(field), field);
    assert.ok(preview.includes('<img src=x onerror="window.__unsafe=1">'));
    assert.equal(await page.locator('#proposal img').count(), 0);
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => !!window.__unsafe), false);
    checks.push('complete-guidance-preview', 'untrusted-text-rendering');

    await page.locator('#apply').click();
    const task = page.locator('#tasks .task');
    await task.getByRole('button', {name: '开始任务', exact: true}).click();
    await page.locator('#note').fill('开始测试修订');
    await page.locator('#feedback-form button[type=submit]').click();
    await task.getByRole('button', {name: '提交成果', exact: true}).click();
    await page.locator('#note').fill('人工夹具：提交修订稿');
    await page.locator('#artifact-id').fill('brief');
    await page.locator('#artifact-version').fill('2');
    await page.locator('#evidence').fill('人工夹具：第2节修订稿和差异记录');
    await page.locator('#minutes').fill('12');
    await page.locator('#feedback-form button[type=submit]').click();
    await task.getByRole('button', {name: '验收通过', exact: true}).waitFor();
    saved = await state(id);
    assert.equal(saved.plan.tasks[0].status, 'pending_review');
    checks.push('submit-is-pending-review');

    await task.getByRole('button', {name: '验收通过', exact: true}).click();
    await page.locator('#note').fill('人工夹具：逐项检查');
    await page.locator('#reviewer').selectOption('A');
    for (let i = 0; i < 2; i++)
      await page.locator('.criterion-evidence').nth(i).fill('人工夹具：已看到第2行核对及 v1 → v2 差异记录');
    await page.locator('#feedback-form button[type=submit]').click();
    await page.getByText('有验收条件未通过，请退回修改；不能标记完成', {exact: true}).waitFor();
    assert.equal((await state(id)).plan.tasks[0].status, 'pending_review');
    checks.push('unconfirmed-criterion-cannot-complete');
    for (let i = 0; i < 2; i++) await page.locator('.criterion-pass').nth(i).check();
    await page.locator('#feedback-form button[type=submit]').click();
    await page.getByRole('heading', {name: '修订测试说明文档第2节 · 已验收', exact: true}).waitFor();
    await page.reload();
    await page.getByRole('heading', {name: '修订测试说明文档第2节 · 已验收', exact: true}).waitFor();
    saved = await state(id);
    assert.equal(saved.plan.tasks[0].review.criterion_results.length, 2);
    assert.equal(saved.plan.tasks[0].review.artifact_version, 2);
    assert.equal(saved.live_verified, false);
    checks.push('criterion-evidence-version-persists');

    fs.mkdirSync(path.join(__dirname, 'test-output'), {recursive: true});
    await page.screenshot({path: path.join(__dirname, 'test-output/guidance-desktop.png'), fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({path: path.join(__dirname, 'test-output/guidance-mobile.png'), fullPage: true});
    checks.push('mobile-no-overflow');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ok: true, fixture: 'human-authored', checks, browserErrors: errors}));
  } finally {
    if (browser) await browser.close();
    if (server) {const done = new Promise(r => server.once('exit', r)); server.kill(); await done;}
    fs.rmSync(temp, {recursive: true, force: true});
  }
})().catch(e => {console.error(e); process.exitCode = 1;});
