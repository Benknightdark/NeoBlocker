import { defineConfig } from 'wxt';
import fs from 'node:fs';
import path from 'node:path';

// 動態掃描並加載 public/rules 下所有的 static-*.json 規則集
function getRuleResources() {
  const resources = [
    {
      id: 'ads-basic',
      enabled: true,
      path: 'rules/ads-basic.json',
    },
  ];

  try {
    const rulesDir = path.resolve(process.cwd(), 'public/rules');
    if (fs.existsSync(rulesDir)) {
      const files = fs.readdirSync(rulesDir);
      const staticFiles = files
        .filter(f => f.startsWith('static-') && f.endsWith('.json'))
        .sort();

      for (const file of staticFiles) {
        // file: static-base-001.json -> id: base-001
        const id = file.replace('static-', '').replace('.json', '');
        resources.push({
          id,
          enabled: false, // 預設關閉，由背景腳本動態啟用
          path: `rules/${file}`,
        });
      }
    }
  } catch (error) {
    console.error('動態加載靜態規則集失敗:', error);
  }

  return resources;
}

// https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Neo AdBlocker',
    description: '輕量、隱私友善的擋廣告工具：封鎖常見廣告與追蹤網域，支援站點白名單與自訂規則，不蒐集個資。',
    minimum_chrome_version: '121',
    permissions: [
      'declarativeNetRequest',
      'declarativeNetRequestFeedback',
      'storage',
      'scripting',
      'tabs',
    ],
    host_permissions: ['<all_urls>'],
    declarative_net_request: {
      rule_resources: getRuleResources(),
    },
    action: {
      default_icon: {
        '16': 'icon/icon-16.png',
        '32': 'icon/icon-32.png',
        '48': 'icon/icon-48.png',
      },
    },
    icons: {
      '16': 'icon/icon-16.png',
      '32': 'icon/icon-32.png',
      '48': 'icon/icon-48.png',
      '128': 'icon/icon-128.png',
      '256': 'icon/icon-256.png',
    },
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      delete manifest.options_ui;
      manifest.options_page = 'options.html';
    },
  },
});
