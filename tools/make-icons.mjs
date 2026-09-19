// 由 public/icons/icon.svg 產生 PWA 用的 PNG 圖示與 favicon.ico
// 用法(在專案根目錄):
//   docker run --rm -i -u 1000:1000 -e HOME=/tmp -v "$PWD:/w" -w /e2e music-player-e2e node --input-type=module < tools/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('/w/public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const png = async (size) => {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  const buf = await page.screenshot({ type: 'png' });
  await page.close();
  return buf;
};

for (const s of [72, 96, 128, 144, 152, 192, 384, 512]) writeFileSync(`/w/public/icons/icon-${s}x${s}.png`, await png(s));

// favicon.ico:內嵌 48x48 PNG
const p48 = await png(48);
const head = Buffer.alloc(22);
head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 48; head[7] = 48; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(p48.length, 14); head.writeUInt32LE(22, 18);
writeFileSync('/w/public/favicon.ico', Buffer.concat([head, p48]));
await browser.close();
