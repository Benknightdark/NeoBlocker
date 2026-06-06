export const STORE_KEYS = {
  WHITELIST: 'whitelist',
  CUSTOM_FILTERS: 'customFilters',
  COSMETIC: 'cosmetic',
  SHIELD_BASE: 'shield_base',
  SHIELD_PRIVACY: 'shield_privacy',
  SHIELD_CHINA: 'shield_china',
};
export const CSS_ID = 'cosmetic-css-v2';
export const ALWAYS_EXCLUDE: string[] = [];

const getDNR = () => chrome.declarativeNetRequest;

// 全域記憶體快取以減少 I/O 與效能損耗
let cssPathCache = '';
let lastRegisteredConfig = '';

/**
 * 重建動態封鎖規則 (白名單及自訂規則)
 */
export async function rebuildDynamicRules(whitelist: string[], filters: string[]) {
  const old = await getDNR().getDynamicRules();
  const removeIds = old.map(r => r.id);

  let id = 1;
  const rules = [];

  // 白名單網域：整頁放行（限主要/子框架）
  for (const domain of whitelist) {
    const d = String(domain).trim().toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(d) || d.startsWith('.') || d.endsWith('.') || d.startsWith('-') || d.endsWith('-')) continue;
    rules.push({
      id: id++,
      priority: 10000,
      action: { type: 'allowAllRequests' as const },
      condition: {
        resourceTypes: ['main_frame' as const, 'sub_frame' as const],
        requestDomains: [d],
      },
    });
  }

  // 自訂黑名單：阻擋請求
  for (const f of filters) {
    const filter = String(f).trim();
    if (!filter) continue;
    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'block' as const },
      condition: { urlFilter: filter },
    });
  }

  await getDNR().updateDynamicRules({ removeRuleIds: removeIds, addRules: rules });
}

/**
 * 同步靜態規則集 (Base, Privacy, China)
 */
export async function syncStaticRulesets(baseEnabled: boolean, privacyEnabled: boolean, chinaEnabled: boolean) {
  const manifest = chrome.runtime.getManifest();
  const resources = manifest.declarative_net_request?.rule_resources || [];

  const enableIds: string[] = [];
  const disableIds: string[] = [];

  for (const res of resources) {
    if (res.id === 'ads-basic') {
      enableIds.push(res.id);
      continue;
    }

    if (res.id.startsWith('base-')) {
      if (baseEnabled) enableIds.push(res.id);
      else disableIds.push(res.id);
    } else if (res.id.startsWith('privacy-')) {
      if (privacyEnabled) enableIds.push(res.id);
      else disableIds.push(res.id);
    } else if (res.id.startsWith('china-')) {
      if (chinaEnabled) enableIds.push(res.id);
      else disableIds.push(res.id);
    } else {
      enableIds.push(res.id);
    }
  }

  console.log('同步靜態規則集：', { enableIds, disableIds });
  await getDNR().updateEnabledRulesets({
    enableRulesetIds: enableIds,
    disableRulesetIds: disableIds,
  }).catch(err => {
    console.error('更新靜態規則集失敗:', err);
  });
}

/**
 * 取得 content.css 的路徑 (導入記憶體快取)
 */
async function resolveCssPath() {
  if (cssPathCache) return cssPathCache;
  const candidates = ['content.css'];
  for (const p of candidates) {
    const url = chrome.runtime.getURL(p);
    try {
      if (await fetch(url).then(r => r.ok)) {
        cssPathCache = p;
        return p;
      }
    } catch (_) {}
  }
  throw new Error('找不到 content.css');
}

/**
 * 套用 Cosmetic 樣式注入 (導入重複註冊過濾機制)
 */
export async function applyCosmetic(whitelist: string[], cosmeticEnabled: boolean) {
  const currentConfig = JSON.stringify({ whitelist, cosmeticEnabled });
  if (currentConfig === lastRegisteredConfig) {
    return; // 配置無變更，跳過動態註冊流程，減少記憶體與 CPU 開銷
  }

  // 卸載舊的 Cosmetic 註冊
  await chrome.scripting.unregisterContentScripts({ ids: [CSS_ID] }).catch(() => {});
  if (!cosmeticEnabled) {
    lastRegisteredConfig = currentConfig;
    return;
  }

  const excludeMatches = [
    ...ALWAYS_EXCLUDE,
    ...whitelist.flatMap(d => [`*://${d}/*`, `*://*.${d}/*`]),
  ];

  const cssPath = await resolveCssPath();
  await chrome.scripting.registerContentScripts([
    {
      id: CSS_ID,
      matches: ['<all_urls>'],
      excludeMatches,
      css: [cssPath],
      runAt: 'document_start',
      world: 'MAIN',
    },
  ]);

  lastRegisteredConfig = currentConfig;
}

/**
 * 一次性讀取 Storage 並同步所有設定，大幅降低 I/O 與 IPC 開銷
 */
export async function syncAllSettings() {
  const data = await chrome.storage.sync.get([
    STORE_KEYS.WHITELIST,
    STORE_KEYS.CUSTOM_FILTERS,
    STORE_KEYS.COSMETIC,
    STORE_KEYS.SHIELD_BASE,
    STORE_KEYS.SHIELD_PRIVACY,
    STORE_KEYS.SHIELD_CHINA,
  ]);

  const whitelist = (data[STORE_KEYS.WHITELIST] || []) as string[];
  const filters = (data[STORE_KEYS.CUSTOM_FILTERS] || []) as string[];
  const cosmeticEnabled = data[STORE_KEYS.COSMETIC] !== false;
  const baseEnabled = data[STORE_KEYS.SHIELD_BASE] !== false;
  const privacyEnabled = data[STORE_KEYS.SHIELD_PRIVACY] !== false;
  const chinaEnabled = data[STORE_KEYS.SHIELD_CHINA] !== false;

  await Promise.all([
    rebuildDynamicRules(whitelist, filters),
    syncStaticRulesets(baseEnabled, privacyEnabled, chinaEnabled),
    applyCosmetic(whitelist, cosmeticEnabled),
  ]);
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(async () => {
    await syncAllSettings();
  });

  chrome.runtime.onStartup.addListener(async () => {
    await syncAllSettings();
  });

  // 接收 Popup / Options 通訊訊息 (支援單一合併的 SYNC_ALL_SETTINGS 訊息)
  chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    if (msg?.type === 'SYNC_ALL_SETTINGS') {
      syncAllSettings().then(() => send({ ok: true }));
      return true;
    }
    // 相容舊有訊息，直接做一次性完整同步
    if (msg?.type === 'REBUILD_RULES' || msg?.type === 'SYNC_STATIC_RULESETS' || msg?.type === 'APPLY_COSMETIC') {
      syncAllSettings().then(() => send({ ok: true }));
      return true;
    }
    if (msg?.type === 'TOGGLE_COSMETIC') {
      chrome.storage.sync.set({ [STORE_KEYS.COSMETIC]: msg.enabled }).then(() => {
        syncAllSettings().then(() => send({ ok: true }));
      });
      return true;
    }
  });

  // 監聽儲存庫變更並重新同步所有設定
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (
      changes[STORE_KEYS.WHITELIST] ||
      changes[STORE_KEYS.CUSTOM_FILTERS] ||
      changes[STORE_KEYS.COSMETIC] ||
      changes[STORE_KEYS.SHIELD_BASE] ||
      changes[STORE_KEYS.SHIELD_PRIVACY] ||
      changes[STORE_KEYS.SHIELD_CHINA]
    )) {
      syncAllSettings();
    }
  });
});
