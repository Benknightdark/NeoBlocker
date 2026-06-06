import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncAllSettings, STORE_KEYS } from '../entrypoints/background';

describe('Background Settings Synchronizer', () => {
  const mockGetDynamicRules = vi.fn();
  const mockUpdateDynamicRules = vi.fn();
  const mockUpdateEnabledRulesets = vi.fn().mockResolvedValue(undefined);
  const mockStorageGet = vi.fn();
  const mockStorageSet = vi.fn();
  const mockGetURL = vi.fn();
  const mockUnregisterContentScripts = vi.fn();
  const mockRegisterContentScripts = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    
    // 初始化所有被 restore 的 mock 函數，確保非同步調用及 .catch 不會拋錯
    mockGetDynamicRules.mockResolvedValue([]);
    mockUpdateDynamicRules.mockResolvedValue(undefined);
    mockUpdateEnabledRulesets.mockResolvedValue(undefined);
    mockUnregisterContentScripts.mockResolvedValue(undefined);
    mockRegisterContentScripts.mockResolvedValue(undefined);

    // Setup global chrome mock
    vi.stubGlobal('chrome', {
      declarativeNetRequest: {
        getDynamicRules: mockGetDynamicRules,
        updateDynamicRules: mockUpdateDynamicRules,
        updateEnabledRulesets: mockUpdateEnabledRulesets,
      },
      storage: {
        sync: {
          get: mockStorageGet,
          set: mockStorageSet,
        },
      },
      runtime: {
        getManifest: () => ({
          declarative_net_request: {
            rule_resources: [
              { id: 'ads-basic', enabled: true, path: 'rules/ads-basic.json' },
              { id: 'base-001', enabled: false, path: 'rules/static-base-001.json' },
            ]
          }
        }),
        getURL: mockGetURL,
      },
      scripting: {
        unregisterContentScripts: mockUnregisterContentScripts,
        registerContentScripts: mockRegisterContentScripts,
      }
    });

    mockGetURL.mockReturnValue('chrome-extension://dummy/content.css');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('should rebuild dynamic rules correctly with whitelist and custom filters', async () => {
    mockStorageGet.mockResolvedValue({
      [STORE_KEYS.WHITELIST]: ['example.com', 'test.org'],
      [STORE_KEYS.CUSTOM_FILTERS]: ['||ads-server.com^', '||tracker.com^'],
      [STORE_KEYS.COSMETIC]: true,
      [STORE_KEYS.SHIELD_BASE]: true,
      [STORE_KEYS.SHIELD_PRIVACY]: true,
      [STORE_KEYS.SHIELD_CHINA]: true,
    });

    mockGetDynamicRules.mockResolvedValue([
      { id: 99, priority: 1, action: { type: 'block' }, condition: { urlFilter: 'old' } },
    ]);

    await syncAllSettings();

    expect(mockGetDynamicRules).toHaveBeenCalled();
    expect(mockUpdateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [99],
      addRules: [
        {
          id: 1,
          priority: 10000,
          action: { type: 'allowAllRequests' },
          condition: {
            resourceTypes: ['main_frame', 'sub_frame'],
            requestDomains: ['example.com'],
          },
        },
        {
          id: 2,
          priority: 10000,
          action: { type: 'allowAllRequests' },
          condition: {
            resourceTypes: ['main_frame', 'sub_frame'],
            requestDomains: ['test.org'],
          },
        },
        {
          id: 3,
          priority: 1,
          action: { type: 'block' },
          condition: { urlFilter: '||ads-server.com^' },
        },
        {
          id: 4,
          priority: 1,
          action: { type: 'block' },
          condition: { urlFilter: '||tracker.com^' },
        },
      ],
    });
  });

  it('should filter out invalid domain formats from whitelist', async () => {
    mockStorageGet.mockResolvedValue({
      [STORE_KEYS.WHITELIST]: ['-invalid.com', 'valid-domain.net', 'domain.'],
      [STORE_KEYS.CUSTOM_FILTERS]: [],
      [STORE_KEYS.COSMETIC]: true,
      [STORE_KEYS.SHIELD_BASE]: true,
      [STORE_KEYS.SHIELD_PRIVACY]: true,
      [STORE_KEYS.SHIELD_CHINA]: true,
    });
    mockGetDynamicRules.mockResolvedValue([]);

    await syncAllSettings();

    expect(mockUpdateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [
        {
          id: 1,
          priority: 10000,
          action: { type: 'allowAllRequests' },
          condition: {
            resourceTypes: ['main_frame', 'sub_frame'],
            requestDomains: ['valid-domain.net'],
          },
        },
      ],
    });
  });

  it('should register cosmetic content script with excluded whitelist domains', async () => {
    mockStorageGet.mockResolvedValue({
      [STORE_KEYS.WHITELIST]: ['example.com'],
      [STORE_KEYS.COSMETIC]: true,
      [STORE_KEYS.SHIELD_BASE]: true,
      [STORE_KEYS.SHIELD_PRIVACY]: true,
      [STORE_KEYS.SHIELD_CHINA]: true,
    });
    mockUnregisterContentScripts.mockResolvedValue(undefined);
    mockRegisterContentScripts.mockResolvedValue(undefined);

    await syncAllSettings();

    expect(mockUnregisterContentScripts).toHaveBeenCalledWith({ ids: ['cosmetic-css-v2'] });
    expect(mockRegisterContentScripts).toHaveBeenCalledWith([
      {
        id: 'cosmetic-css-v2',
        matches: ['<all_urls>'],
        excludeMatches: ['*://example.com/*', '*://*.example.com/*'],
        css: ['content.css'],
        runAt: 'document_start',
        world: 'MAIN',
      },
    ]);
  });

  it('should unregister but not register script when cosmetic option is disabled', async () => {
    mockStorageGet.mockResolvedValue({
      [STORE_KEYS.WHITELIST]: ['example.com'],
      [STORE_KEYS.COSMETIC]: false,
      [STORE_KEYS.SHIELD_BASE]: true,
      [STORE_KEYS.SHIELD_PRIVACY]: true,
      [STORE_KEYS.SHIELD_CHINA]: true,
    });
    mockUnregisterContentScripts.mockResolvedValue(undefined);

    await syncAllSettings();

    expect(mockUnregisterContentScripts).toHaveBeenCalledWith({ ids: ['cosmetic-css-v2'] });
    expect(mockRegisterContentScripts).not.toHaveBeenCalled();
  });
});
