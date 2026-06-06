import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const input = process.argv[2];                // 來源圖：支援 SVG/PNG/JPG 等
const outDir = process.argv[3] || "icons";    // 輸出資料夾
const sizes = [16, 32, 48, 128, 256];

if (!input) {
  console.error("用法：node tools/gen-icons.mjs <來源檔> [輸出資料夾]");
  process.exit(1);
}

await fs.mkdir(outDir, { recursive: true });
const buf = await fs.readFile(input);

// SVG 縮小時避免鋸齒；非 SVG 也能正常處理
const isSvg = path.extname(input).toLowerCase() === ".svg";

for (const s of sizes) {
  const img = sharp(buf, isSvg ? { density: Math.max(300, s * 4) } : {});
  await img
    .resize({
      width: s,
      height: s,
      fit: "contain",                         // 不裁切，置中留透明邊
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(outDir, `icon-${s}.png`));
  console.log(`✓ ${outDir}/icon-${s}.png`);
}
console.log("完成。");
