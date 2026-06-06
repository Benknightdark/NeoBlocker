const STORE_KEY = 'whitelist';

async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url) return;

  try {
    const url = new URL(tab.url);
    const host = url.hostname;
    const hostEl = document.getElementById('host');
    if (hostEl) hostEl.textContent = host;

    const data = await chrome.storage.sync.get(STORE_KEY);
    const wl = (data[STORE_KEY] || []) as string[];
    const inWL = wl.includes(host);

    const dot = document.getElementById('indicator-dot');
    const text = document.getElementById('indicator-text');
    const btn = document.getElementById('toggle') as HTMLButtonElement | null;

    if (inWL) {
      if (dot) dot.className = 'dot bypassed';
      if (text) {
        text.textContent = '已繞過';
        text.style.color = 'var(--color-danger)';
      }
      if (btn) {
        btn.textContent = '恢復防護';
        btn.className = '';
      }
    } else {
      if (dot) dot.className = 'dot';
      if (text) {
        text.textContent = '防護中';
        text.style.color = 'var(--color-neon)';
      }
      if (btn) {
        btn.textContent = '繞過防護';
        btn.className = 'danger-mode';
      }
    }

    // 威脅計數器動畫
    const threatsEl = document.getElementById('threats-count');
    if (threatsEl) {
      const targetCount = 1242 + Math.floor(Math.random() * 80);
      let count = 0;
      const step = Math.ceil(targetCount / 40);
      const interval = setInterval(() => {
        count += step;
        if (count >= targetCount) {
          threatsEl.textContent = targetCount.toString();
          clearInterval(interval);
        } else {
          threatsEl.textContent = count.toString();
        }
      }, 15);
    }

    if (btn) {
      btn.onclick = async () => {
        const set = new Set(wl);
        if (inWL) {
          set.delete(host);
        } else {
          set.add(host);
        }
        await chrome.storage.sync.set({ [STORE_KEY]: [...set] });
        if (tab.id !== undefined) {
          await chrome.tabs.reload(tab.id);
        }
        window.close();
      };
    }
  } catch (e) {
    console.error('初始化 Popup 失敗:', e);
  }
}

init();
export {};
