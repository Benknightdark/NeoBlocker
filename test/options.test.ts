import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Options Page Controller', () => {
  const mockStorageGet = vi.fn();
  const mockStorageSet = vi.fn();
  const mockSendMessage = vi.fn();
  const mockTabsQuery = vi.fn();
  const mockTabsReload = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();

    document.body.innerHTML = `
      <textarea id="wl"></textarea>
      <textarea id="filters"></textarea>
      <input type="checkbox" id="shield-base" />
      <input type="checkbox" id="shield-privacy" />
      <input type="checkbox" id="shield-china" />
      <button id="save">儲存並套用</button>
      <span id="status"></span>
    `;

    vi.stubGlobal('chrome', {
      storage: {
        sync: {
          get: mockStorageGet,
          set: mockStorageSet,
        },
      },
      runtime: {
        sendMessage: mockSendMessage,
      },
      tabs: {
        query: mockTabsQuery,
        reload: mockTabsReload,
      },
    });
  });

  it('should load saved storage data into UI', async () => {
    mockStorageGet.mockResolvedValue({
      whitelist: ['example.com', 'test.org'],
      customFilters: ['||ads-server.com^'],
    });

    await import('../entrypoints/options/options');
    await new Promise((resolve) => setTimeout(resolve, 50));

    const wlEl = document.getElementById('wl') as HTMLTextAreaElement;
    const filtersEl = document.getElementById('filters') as HTMLTextAreaElement;

    expect(wlEl.value).toBe('example.com\ntest.org');
    expect(filtersEl.value).toBe('||ads-server.com^');
  });

  it('should save data and trigger reloads on clicking save button', async () => {
    mockStorageGet.mockResolvedValue({
      whitelist: [],
      customFilters: [],
    });
    mockStorageSet.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue({ ok: true });
    mockTabsQuery.mockResolvedValue([{ id: 123, url: 'https://example.com' }]);
    mockTabsReload.mockResolvedValue(undefined);

    await import('../entrypoints/options/options');
    await new Promise((resolve) => setTimeout(resolve, 50));

    const wlEl = document.getElementById('wl') as HTMLTextAreaElement;
    const filtersEl = document.getElementById('filters') as HTMLTextAreaElement;
    const saveBtn = document.getElementById('save') as HTMLButtonElement;

    wlEl.value = '   new-site.com \n  another.org  \n\n';
    filtersEl.value = '||block-me.com^\n';

    saveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockStorageSet).toHaveBeenCalledWith({
      whitelist: ['new-site.com', 'another.org'],
      customFilters: ['||block-me.com^'],
      shield_base: true,
      shield_privacy: true,
      shield_china: true,
    });

    const statusEl = document.getElementById('status') as HTMLSpanElement;
    expect(statusEl.textContent).toBe('已套用 ✅');
  });
});
