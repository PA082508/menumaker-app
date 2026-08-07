// devicesRefusal.test.ts — отказ регистрации устройства обязан ЗВУЧАТЬ.
//
// Повод (07.08, iPad в руках владельца): страница отвечала одной фразой на любую
// беду — «Could not register the device — nothing was created». За ней пряталась
// НЕ нехватка прав, а неполный запрос: организация приходила undefined, ключ
// p_org выпадал из тела, и PostgREST не находил функцию такой сигнатуры. Человек
// с планшетом не мог даже понять, к кому идти.
//
// Проба держит две вещи: знакомые причины переводятся на человеческий, а
// НЕЗНАКОМАЯ показывается дословно — молчание хуже непонятного текста.
import { describe, it, expect } from 'vitest'
import { registerRefusal } from '@/pages/safepass/SafePassDevicesPage'

describe('отказ регистрации устройства говорит причину', () => {
  it('нет прав — называет, к кому идти', () => {
    expect(registerRefusal('not authorized to register devices')).toMatch(/ask the director/i)
  })

  it('нет комнаты у классного пада — говорит, что выбрать', () => {
    expect(registerRefusal('a classroom device needs a classroom')).toMatch(/pick the room/i)
  })

  it('комната чужого центра — называет именно это', () => {
    expect(registerRefusal('classroom abc is not in center xyz')).toMatch(/not in this center/i)
  })

  it('центр чужой организации — отправляет в офис', () => {
    expect(registerRefusal('center abc does not belong to org xyz')).toMatch(/organization/i)
  })

  it('неполный запрос (тот самый случай 07.08) — говорит перезагрузить страницу', () => {
    const pgrst = 'Could not find the function menumaker.safepass_register_device(p_center, p_classroom, p_kind, p_label) in the schema cache'
    expect(registerRefusal(pgrst)).toMatch(/incomplete request/i)
    expect(registerRefusal(pgrst)).toMatch(/organization was missing/i)
  })

  it('нет сети — отдельная причина, а не «нет прав»', () => {
    expect(registerRefusal('TypeError: Failed to fetch')).toMatch(/no connection/i)
  })

  it('незнакомая причина показывается ДОСЛОВНО, а не прячется', () => {
    const odd = 'deadlock detected on relation safepass_devices'
    expect(registerRefusal(odd)).toContain(odd)
  })

  it('каждый ответ говорит, что НИЧЕГО не создано — человек не должен гадать', () => {
    for (const raw of ['not authorized to register devices', 'a classroom device needs a classroom', 'whatever else']) {
      expect(registerRefusal(raw).toLowerCase()).toMatch(/nothing was created|ask the director/)
    }
  })
})
