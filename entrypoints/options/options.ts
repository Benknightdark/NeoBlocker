const KEYS = {
  WHITELIST: 'whitelist',
  CUSTOM_FILTERS: 'customFilters',
  SHIELD_BASE: 'shield_base',
  SHIELD_PRIVACY: 'shield_privacy',
  SHIELD_CHINA: 'shield_china',
};

function dedupLines(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
}

async function load() {
  const data = await chrome.storage.sync.get([
    KEYS.WHITELIST,
    KEYS.CUSTOM_FILTERS,
    KEYS.SHIELD_BASE,
    KEYS.SHIELD_PRIVACY,
    KEYS.SHIELD_CHINA,
  ]);
  const wl = (data[KEYS.WHITELIST] || []) as string[];
  const filters = (data[KEYS.CUSTOM_FILTERS] || []) as string[];
  const baseVal = data[KEYS.SHIELD_BASE] !== false;
  const privacyVal = data[KEYS.SHIELD_PRIVACY] !== false;
  const chinaVal = data[KEYS.SHIELD_CHINA] !== false;

  const wlEl = document.getElementById('wl') as HTMLTextAreaElement | null;
  const filtersEl = document.getElementById('filters') as HTMLTextAreaElement | null;
  const shieldBaseEl = document.getElementById('shield-base') as HTMLInputElement | null;
  const shieldPrivacyEl = document.getElementById('shield-privacy') as HTMLInputElement | null;
  const shieldChinaEl = document.getElementById('shield-china') as HTMLInputElement | null;

  if (wlEl) wlEl.value = wl.join('\n');
  if (filtersEl) filtersEl.value = filters.join('\n');
  if (shieldBaseEl) shieldBaseEl.checked = baseVal;
  if (shieldPrivacyEl) shieldPrivacyEl.checked = privacyVal;
  if (shieldChinaEl) shieldChinaEl.checked = chinaVal;
}

const saveBtn = document.getElementById('save') as HTMLButtonElement | null;
if (saveBtn) {
  saveBtn.onclick = async () => {
    const wlEl = document.getElementById('wl') as HTMLTextAreaElement | null;
    const filtersEl = document.getElementById('filters') as HTMLTextAreaElement | null;
    const shieldBaseEl = document.getElementById('shield-base') as HTMLInputElement | null;
    const shieldPrivacyEl = document.getElementById('shield-privacy') as HTMLInputElement | null;
    const shieldChinaEl = document.getElementById('shield-china') as HTMLInputElement | null;

    const whitelist = wlEl ? dedupLines(wlEl.value) : [];
    const customFilters = filtersEl ? dedupLines(filtersEl.value) : [];
    const baseShield = shieldBaseEl ? shieldBaseEl.checked : true;
    const privacyShield = shieldPrivacyEl ? shieldPrivacyEl.checked : true;
    const chinaShield = shieldChinaEl ? shieldChinaEl.checked : true;

    await chrome.storage.sync.set({
      [KEYS.WHITELIST]: whitelist,
      [KEYS.CUSTOM_FILTERS]: customFilters,
      [KEYS.SHIELD_BASE]: baseShield,
      [KEYS.SHIELD_PRIVACY]: privacyShield,
      [KEYS.SHIELD_CHINA]: chinaShield,
    });

    const el = document.getElementById('status');
    if (el) {
      el.textContent = '已套用 ✅';
      setTimeout(() => (el.textContent = ''), 1500);
    }
  };
}

async function init() {
  await load();
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = '執行同步協定';
  }
}

init();

export {};
