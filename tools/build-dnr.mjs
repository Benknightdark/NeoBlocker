// Node 18+。將 EasyList/EasyPrivacy/EasyList China 等轉為 MV3 declarativeNetRequest 靜態規則。
// 僅使用 safe actions（block/allow）。
import fs from 'node:fs/promises';
import path from 'node:path';

const LISTS = [
  {
    key: 'base',
    urls: ['https://easylist.to/easylist/easylist.txt'],
  },
  {
    key: 'privacy',
    urls: ['https://easylist.to/easylist/easyprivacy.txt'],
  },
  {
    key: 'china',
    urls: [
      'https://easylist-downloads.adblockplus.org/easylistchina.txt',
      'https://raw.githubusercontent.com/cjx82630/cjxlist/master/cjxlist.txt',
    ],
  },
];
const OUT_DIR = 'public/rules';
const MAX_PER_FILE = 25000; // 提高單檔規則上限，控制總 Ruleset 數量在 10 個以內

const TYPE_MAP = new Map([
  ['script', 'script'],
  ['image', 'image'],
  ['stylesheet', 'stylesheet'],
  ['font', 'font'],
  ['media', 'media'],
  ['xmlhttprequest', 'xmlhttprequest'],
  ['subdocument', 'sub_frame'],
  ['document', 'main_frame'],
  ['websocket', 'websocket'],
  ['ping', 'ping'],
]);

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // 1. 清理舊的靜態規則 JSON 檔案，以防殘留檔案影響 WXT 動態掃描
  const existingFiles = await fs.readdir(OUT_DIR).catch(() => []);
  for (const file of existingFiles) {
    if (file.startsWith('static-') && file.endsWith('.json')) {
      await fs.unlink(path.join(OUT_DIR, file));
    }
  }

  const allFiles = [];
  let totalRules = 0;

  // 2. 依模組下載並編譯
  for (const listConfig of LISTS) {
    console.log(`\n⏳ 正在下載並解析 [${listConfig.key}] 模組規則...`);
    const texts = await Promise.all(listConfig.urls.map(url => fetchText(url)));
    const lines = texts.flatMap(t => t.split(/\r?\n/));

    const rules = [];
    let nextId = 1;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('!') || line.startsWith('[')) continue;
      if (isCosmetic(line)) continue;

      const parsed = parseFilterLine(line);
      if (!parsed) continue;

      const { exception, pattern, isRegex, types, initiator, initiatorNot, party } = parsed;
      const rule = {
        id: nextId++,
        priority: exception ? 10000 : 1,
        action: { type: exception ? 'allow' : 'block' },
        condition: {}
      };

      if (isRegex) {
        if (pattern.length > 2000) continue;
        rule.condition.regexFilter = pattern;
      } else {
        if (pattern.startsWith('||*')) continue;
        rule.condition.urlFilter = pattern;
      }

      if (types && types.length) {
        const mapped = types.map(t => TYPE_MAP.get(t)).filter(Boolean);
        if (mapped.length) rule.condition.resourceTypes = mapped;
      }

      if (initiator?.length) rule.condition.initiatorDomains = initiator;
      if (initiatorNot?.length) rule.condition.excludedInitiatorDomains = initiatorNot;
      if (party) rule.condition.domainType = party;

      rules.push(rule);
    }

    console.log(`⚡ [${listConfig.key}] 解析完成，共 ${rules.length} 條規則，開始分割寫入...`);
    totalRules += rules.length;

    // 分割寫入
    for (let i = 0; i < rules.length; i += MAX_PER_FILE) {
      const chunk = rules.slice(i, i + MAX_PER_FILE);
      const idx = Math.floor(i / MAX_PER_FILE) + 1;
      const file = path.join(OUT_DIR, `static-${listConfig.key}-${String(idx).padStart(3, '0')}.json`);
      await fs.writeFile(file, JSON.stringify(chunk, null, 2));
      const manifestPath = file.replace(/\\/g, '/').replace(/^public\//, '');
      const rulesetId = `${listConfig.key}-${String(idx).padStart(3, '0')}`;
      allFiles.push({ id: rulesetId, path: manifestPath, count: chunk.length, category: listConfig.key });
    }
  }

  // 3. 輸出 MANIFEST_SNIPPET.json 供 WXT 與背景參考
  const manifestSnippet = {
    declarative_net_request: {
      rule_resources: allFiles.map((f) => ({
        id: f.id,
        enabled: false, // 全部預設 false，我們將在背景動態載入
        path: f.path
      }))
    }
  };

  await fs.writeFile(
    path.join(OUT_DIR, 'MANIFEST_SNIPPET.json'),
    JSON.stringify(manifestSnippet, null, 2)
  );

  const msg = [
    `✅ 建置完成：共 ${totalRules} 條規則，輸出 ${allFiles.length} 片`,
    ...allFiles.map(f => `  - ${f.path}  (${f.count} 條)  id=${f.id}  [${f.category}]`),
    `\n➡ 規則已成功分類輸出。wxt.config.ts 將會自動偵測並注入這些規則集。`
  ].join('\n');
  await fs.writeFile(path.join(OUT_DIR, 'BUILD_SUMMARY.txt'), msg);
  console.log(msg);
}

function isCosmetic(line) {
  return line.includes('##') || line.includes('#@#') || line.includes('#?#') || line.includes('#$#');
}

function parseFilterLine(line) {
  const exception = line.startsWith('@@');
  const body = exception ? line.slice(2) : line;

  let pattern = body;
  let opts = '';
  const dollar = body.indexOf('$');
  if (dollar !== -1) {
    pattern = body.slice(0, dollar);
    opts = body.slice(dollar + 1);
  }

  let isRegex = false;
  if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
    isRegex = true;
    pattern = pattern.slice(1, -1);
  }

  let types = [];
  let initiator = [];
  let initiatorNot = [];
  let party = '';
  if (opts) {
    const pairs = opts.split(',').map(s => s.trim()).filter(Boolean);
    for (const p of pairs) {
      if (p === 'third-party') party = 'thirdParty';
      else if (p === 'first-party' || p === '~third-party') party = 'firstParty';
      else if (p.startsWith('domain=')) {
        const ds = p.slice('domain='.length).split('|');
        for (const d of ds) {
          const dd = d.trim();
          if (!dd) continue;
          if (dd.startsWith('~')) initiatorNot.push(cleanDomain(dd.slice(1)));
          else initiator.push(cleanDomain(dd));
        }
      } else if (TYPE_MAP.has(p)) {
        types.push(p);
      } else if (p.includes('redirect') || p.includes('rewrite') || p.includes('csp') || p.includes('removeparam')) {
        return null;
      }
    }
  }

  if (!isRegex) {
    const p = pattern.trim();
    if (!p || p === '*' || p === '||') return null;
  }

  return { exception, pattern, isRegex, types, initiator, initiatorNot, party };
}

function cleanDomain(d) { return d.replace(/^\./, ''); }

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`抓取失敗 ${url}: ${res.status}`);
    return '';
  }
  return await res.text();
}

main().catch(err => { console.error(err); process.exitCode = 1; });
