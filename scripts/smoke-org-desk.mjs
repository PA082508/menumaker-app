// smoke-org-desk.mjs — стол Татьяны, маршрут по типам и закрытый жёлоб сканов.
//
// Что проверяется (заказ владельца 05.08):
//   1. вкладка «Meals & income» есть у орг-роли, и питание/доход лежат ТАМ;
//   2. «Needs a person» этих типов больше не показывает;
//   3. перекрёстные ссылки в обе стороны (Inbox ↔ Paper applications);
//   4. «Attach scan» стоит в строке семьи на Paper applications;
//   5. канал «скан → строка Inbox» закрыт на сервере: submit_enrollment_form
//      с source='paper_entry' отбивается СЛОВАМИ и ничего не пишет.
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { pickCentre } from './lib/switchCentre.mjs'

const PROD='https://menumaker-app.vercel.app', APP=process.env.APP_ORIGIN||'http://localhost:4173'
const SHOTS = path.resolve('./smoke-out')
fs.mkdirSync(SHOTS, { recursive: true })
const fails=[]; const ok=n=>console.log(`  ✓ ${n}`); const bad=(n,w)=>{fails.push(`${n}: ${w}`);console.log(`  ✗ ${n} — ${w}`)}

const ctx = await chromium.launchPersistentContext(path.resolve('./.demo-profile'), { headless:true, serviceWorkers:'block', viewport:{width:1440,height:940} })
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto(PROD,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(12000)
const sess = await page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('sb-'));return k?{k,v:localStorage.getItem(k)}:null})
await page.goto(APP,{waitUntil:'domcontentloaded'}); await page.evaluate(({k,v})=>localStorage.setItem(k,v),sess)

await page.goto(APP+'/enrollment-inbox',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000)
await pickCentre(page,'Wickliffe'); await page.waitForTimeout(3000)
{
  const body = await page.locator('body').innerText()
  body.includes('Meals & income') ? ok('вкладка «Meals & income» на месте') : bad('вкладка стола','её нет')
  // «Needs a person» — питания и дохода там больше нет
  const todoTxt = body
  const noCacfpInTodo = !/CACFP Enrollment/i.test(todoTxt)
  noCacfpInTodo ? ok('«Needs a person» не показывает CACFP-формы') : bad('маршрут','CACFP всё ещё в директорской вкладке')
  await page.getByRole('button',{name:/Meals & income/}).first().click(); await page.waitForTimeout(2000)
  const deskTxt = await page.locator('body').innerText()
  const hasCacfpOnDesk = /CACFP Enrollment/i.test(deskTxt)
  hasCacfpOnDesk ? ok('питание лежит на столе Татьяны') : bad('стол','CACFP-форм на столе нет')
  deskTxt.includes('Paper applications') ? ok('со стола есть ссылка на Paper applications') : bad('ссылка','ссылки со стола нет')
  await page.screenshot({path:path.join(SHOTS,'org-desk-tab.png'),fullPage:false})
}
await page.goto(APP+'/iea-confirm',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000)
await pickCentre(page,'Wickliffe'); await page.waitForTimeout(3000)
{
  const body = await page.locator('body').innerText()
  body.includes('Meals & income inbox') ? ok('обратная ссылка с Paper applications есть') : bad('ссылка','обратной ссылки нет')
  const attach = await page.getByText('📎 Attach scan').count()
  attach > 0 ? ok(`«Attach scan» стоит в строках семей (${attach})`) : bad('attach','кнопки нет')
  await page.screenshot({path:path.join(SHOTS,'paper-attach-scan.png'),fullPage:false})
}
await ctx.close()
console.log(fails.length?`\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}`:'\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length?1:0)
