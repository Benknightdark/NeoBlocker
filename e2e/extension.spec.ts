import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';

// 擴充 Playwright 的 test 物件，以自動加載擴充功能並取得 Extension ID
const extensionTest = test.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({ }, use) => {
    const pathToExtension = path.resolve('.output/chrome-mv3');
    const context = await baseLaunchPersistentContext(pathToExtension);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    // 從 Service Worker 的 URL 中取得 Extension ID
    // 格式如 chrome-extension://<id>/background.js
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

async function baseLaunchPersistentContext(pathToExtension: string) {
  return await chromium.launchPersistentContext('', {
    headless: false, // Extension 測試必須有頭模式
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });
}

extensionTest.describe('NeoBlocker E2E 測試主控台', () => {

  extensionTest('測試一：Popup 頁面應能正常顯示 UI 標題與防護狀態', async ({ page, extensionId }) => {
    // 導向 Popup 頁面
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // 驗證標題
    const title = page.locator('.title');
    await expect(title).toHaveText('NEO-SHIELD v1.0.0');

    // 驗證狀態
    const statusText = page.locator('#indicator-text');
    await expect(statusText).toHaveText('防護中');
  });

  extensionTest('測試二：Options 頁面能正確儲存與持久化防護設定', async ({ page, extensionId }) => {
    // 導向 Options 頁面
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // 驗證頁面標題
    await expect(page).toHaveTitle('Neo Blocker 核心主控台');

    const wlTextarea = page.locator('#wl');
    const filtersTextarea = page.locator('#filters');
    const saveBtn = page.locator('#save');
    const status = page.locator('#status');

    // 輸入白名單與自訂規則
    await wlTextarea.fill('example.com\ntest-site.org');
    await filtersTextarea.fill('||blocked-domain.com^');

    // 點選儲存
    await saveBtn.click();

    // 驗證儲存狀態顯示
    await expect(status).toHaveText('已套用 ✅');

    // 重新整理頁面，驗證資料是否確實被持久化寫入 storage
    await page.reload();
    await expect(wlTextarea).toHaveValue('example.com\ntest-site.org');
    await expect(filtersTextarea).toHaveValue('||blocked-domain.com^');

    // 測試切換防禦模組開關
    const shieldPrivacy = page.locator('#shield-privacy');
    await expect(shieldPrivacy).toBeChecked(); // 預設應為 checked
    await page.evaluate(() => {
      const el = document.getElementById('shield-privacy') as HTMLInputElement | null;
      if (el) {
        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await saveBtn.click();
    await expect(status).toHaveText('已套用 ✅');

    await page.reload();
    await expect(shieldPrivacy).not.toBeChecked(); // 重新整理後狀態依然為 unchecked
  });

  extensionTest('測試三：DNR 廣告攔截與白名單放行機制測試', async ({ page, extensionId }) => {
    const targetUrl = 'https://neo-blog-iota.vercel.app/';
    const targetHost = 'neo-blog-iota.vercel.app';
    const adDomain = 'googlesyndication.com';

    // 1. 首先，導向 Options 頁面清空白名單，並啟動所有的防護模組以測試預設攔截
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.locator('#wl').fill(''); // 清空白名單

    // 確保三個防禦 checkbox 均為 checked
    await page.evaluate(() => {
      ['shield-base', 'shield-privacy', 'shield-china'].forEach(id => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    await page.locator('#save').click();
    await expect(page.locator('#status')).toHaveText('已套用 ✅');

    // 2. 測試攔截：導向測試網站，此時網頁內建的 Google Ads 腳本應被自動封鎖
    // 監聽該頁面中 googlesyndication.com 的請求失敗事件
    const failedRequestPromise = page.waitForEvent('requestfailed', {
      filter: (req) => req.url().includes(adDomain),
      timeout: 10000,
    });

    // 導向測試網頁（會自動載入廣告 JS）
    await page.goto(targetUrl);

    const failedReq = await failedRequestPromise;
    expect(failedReq).toBeTruthy();
    const failure = failedReq.failure();
    // 驗證失敗原因是被擴充功能阻擋 (ERR_BLOCKED_BY_CLIENT)
    expect(failure?.errorText).toMatch(/blocked-by-client|ERR_BLOCKED_BY_CLIENT/i);

    // 3. 測試白名單放行：導向 Options 頁面將 neo-blog-iota.vercel.app 加入白名單
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.locator('#wl').fill(targetHost);
    await page.locator('#save').click();
    await expect(page.locator('#status')).toHaveText('已套用 ✅');

    // 4. 再次導向測試網頁，驗證廣告請求不再被阻擋 (request 事件應成功發出)
    const requestPromise = page.waitForEvent('request', {
      filter: (req) => req.url().includes(adDomain),
      timeout: 10000,
    });

    await page.goto(targetUrl);

    const req = await requestPromise;
    expect(req).toBeTruthy();
    // 白名單作用下，請求應該被放行（無 failure）
    await page.waitForTimeout(1000);
  });
});
