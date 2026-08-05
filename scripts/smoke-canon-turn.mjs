// smoke-canon-turn.mjs — поворот канона, снятая дверь Quick Add и вход к отклонённым.
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { pickCentre } from './lib/switchCentre.mjs'
const PROD='https://menumaker-app.vercel.app', APP=process.env.APP_ORIGIN||PROD
const SHOTS=path.resolve('./smoke-out'); fs.mkdirSync(SHOTS,{recursive:true})
const fails=[]; const ok=n=>console.log(`  ✓ ${n}`); const bad=(n,w)=>{fails.push(`${n}: ${w}`);console.log(`  ✗ ${n} — ${w}`)}
const ctx=await chromium.launchPersistentContext(path.resolve('./.demo-profile'),{headless:true,serviceWorkers:'block',viewport:{width:1440,height:940}})
const page=ctx.pages()[0]??await ctx.newPage()
await page.goto(PROD,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(12000)

// ─── 1. Столы после поворота ────────────────────────────────────────────────
await page.goto(APP+'/enrollment-inbox',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000)
await pickCentre(page,'Wickliffe'); await page.waitForTimeout(3500)
{
  const body=await page.locator('body').innerText()
  const cacfpInTodo=/CACFP Enrollment/i.test(body)
  cacfpInTodo?ok('форма питания вернулась в директорский список («Needs a person»)'):bad('поворот','CACFP в директорском списке нет')
  const badgeLine=(body.match(/Needs a person · (\d+)/)||[])[0]||'(нет)'
  console.log(`    счётчик: ${badgeLine}`)
  await page.getByRole('button',{name:/Meals & income/}).first().click().catch(()=>{})
  await page.waitForTimeout(2000)
  const desk=await page.locator('body').innerText()
  const deskHasCacfp=/CACFP Enrollment/i.test(desk)
  !deskHasCacfp?ok('на столе Татьяны питания больше нет — только доход'):bad('поворот','CACFP остался на орг-столе')
  await page.screenshot({path:path.join(SHOTS,'canon-turn-desks.png'),fullPage:false})
}

// ─── 6а. Вкладка Rejected и достижимость «File this scan» ───────────────────
{
  const tab=page.getByRole('button',{name:/Rejected/})
  const has=await tab.count()
  has?ok('вкладка «Rejected» на месте'):bad('rejected','вкладки нет')
  if(has){
    await tab.first().click(); await page.waitForTimeout(2500)
    const reviews=page.getByRole('button',{name:'Review'})
    const n=await reviews.count()
    n>0?ok(`отклонённые строки открываются (${n} шт.)`):bad('rejected','строк нет')
    let scanBtn=0
    for(let i=0;i<Math.min(n,6);i++){
      await reviews.nth(i).click(); await page.waitForTimeout(2200)
      scanBtn=await page.getByRole('button',{name:/File this scan/}).count()
      if(scanBtn){ await page.screenshot({path:path.join(SHOTS,'rejected-file-scan.png'),fullPage:false}); break }
      await page.getByRole('button',{name:'Close'}).first().click().catch(()=>{}); await page.waitForTimeout(700)
    }
    scanBtn?ok('«📎 File this scan» достижима на отклонённой строке со сканом')
           :bad('перевеска','кнопки нет ни на одной из открытых отклонённых строк')
    await page.keyboard.press('Escape').catch(()=>{})
  }
}

// ─── 5. Quick Add снят · реактивация обоими путями ──────────────────────────
await page.goto(APP+'/children/import',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000)
{
  const body=await page.locator('body').innerText()
  !/Quick add a child/i.test(body)?ok('«⚡ Quick add a child» на странице импорта нет')
                                  :bad('quick add','кнопка всё ещё стоит')
  await page.screenshot({path:path.join(SHOTS,'import-clean.png'),fullPage:false})
}
{
  // Путь 1: поиск по списку находит выбывшего.
  await page.goto(APP+'/children',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000)
  await pickCentre(page,'Wickliffe'); await page.waitForTimeout(3500)
  const search=page.getByPlaceholder(/Search active & inactive/i).first()
  const hasSearch=await search.count()
  hasSearch?ok('поиск списка ищет и выбывших — путь реактивации №1 на месте')
           :bad('реактивация','поля поиска по активным и выбывшим нет')
  if(hasSearch){
    await search.fill('Bates'); await page.waitForTimeout(2500)
    const found=(await page.locator('body').innerText()).includes('Bates')
    found?ok('поиск нашёл семью в списке'):bad('реактивация','поиск ничего не показал')
  }
  // Путь 2: карточка выбывшего несёт ↩ Reactivate — проверяем на ZZ Demo,
  // где выбывший ребёнок есть по построению (ZZSMOKE Keytest, is_active=false).
  await page.goto(APP+'/center/0de1b5a4-e6d8-4e34-a5e4-e3dde23e1c6c',{waitUntil:'domcontentloaded'})
  await page.waitForTimeout(5000)
  await page.getByPlaceholder(/Search active & inactive/i).first().fill('ZZSMOKE').catch(()=>{})
  await page.waitForTimeout(2500)
  await page.getByText('ZZSMOKE',{exact:false}).first().click().catch(()=>{})
  await page.waitForTimeout(3000)
  const react=await page.getByRole('button',{name:/Reactivate/}).count()
  react?ok('карточка выбывшего несёт «↩ Reactivate» — путь реактивации №2')
       :bad('реактивация','кнопки Reactivate в карточке нет')
  await page.screenshot({path:path.join(SHOTS,'reactivate-paths.png'),fullPage:false})
}
await ctx.close()
console.log(fails.length?`\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}`:'\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length?1:0)
