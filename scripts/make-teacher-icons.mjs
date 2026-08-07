#!/usr/bin/env node
// make-teacher-icons.mjs — иконка App учителя для «Добавить на экран «Домой»».
// Сделана по образцу make-driver-icons.mjs: Playwright уже в зависимостях, второй
// графический инструмент ради двух PNG заводить не за что.
//
//   node scripts/make-teacher-icons.mjs
//   → public/teacher-icon-180.png · public/teacher-icon-512.png
//
// СВОЯ иконка, а не общая: требование спеки — на домашнем экране учителя лежит
// приложение с собственным именем и лицом, а не безымянная вкладка.
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const GREEN = '#0f4c35'
const icon = (size) => `<!doctype html><meta charset="utf-8">
<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;
             background:${GREEN};border-radius:${Math.round(size * 0.22)}px;
             font-family:'Apple Color Emoji','Segoe UI Emoji',sans-serif">
  <div style="font-size:${Math.round(size * 0.54)}px;line-height:1">🧑‍🏫</div>
</body>`

const browser = await chromium.launch()
for (const size of [180, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(icon(size))
  writeFileSync(`public/teacher-icon-${size}.png`, await page.screenshot({ omitBackground: true }))
  await page.close()
  console.log(`public/teacher-icon-${size}.png`)
}
await browser.close()
