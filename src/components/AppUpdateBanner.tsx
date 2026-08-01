// src/components/AppUpdateBanner.tsx
// Экран «обновите приложение» при рассинхроне версий (план 31.07d §7.2, работа 2).
//
// Появляется ТОЛЬКО когда сервер отдаёт сборку, отличную от исполняемой, и штатное
// автообновление её почему-то не забрало. В нормальной жизни человек этой полосы не увидит
// никогда: autoUpdate перезагрузит страницу сам. Она — для случая Ridge, где service worker
// залип или его нет вовсе.
//
// Почему полоса, а не модальное окно поверх работы: пока человек не нажал, он ДОЛЖЕН
// продолжать отмечать. Старая сборка пишет отметки хуже (без строки журнала), но пишет;
// заблокировать экран посреди обеда — отнять инструмент, а это дороже, чем сутки на старой
// версии. Блокировать станет уместно после того, как права на прямую запись будут закрыты
// (работа 1 из §7.2) — тогда старый клиент перестанет сохранять вообще, и молчать нельзя.

import { useState, useSyncExternalStore } from 'react'
import {
  subscribeAppUpdate, getAppUpdateVersion, isAppStale,
  getServedBuild, getRunningBuild, applyUpdate,
} from '@/lib/appUpdate'

export default function AppUpdateBanner() {
  useSyncExternalStore(subscribeAppUpdate, getAppUpdateVersion, getAppUpdateVersion)
  const [busy, setBusy] = useState(false)

  if (!isAppStale()) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 16px',
        background: '#7c2d12', color: '#fff',
        fontSize: 14, lineHeight: 1.35,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <span style={{ flex: '1 1 260px' }}>
        <strong>Приложение устарело.</strong>{' '}
        Отметки с этой версии могут сохраняться без времени подачи. Нажмите «Обновить» —
        несохранённые отметки не потеряются, они лежат в памяти устройства.
      </span>

      <span style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.7 }}>
        {getRunningBuild()} → {getServedBuild() ?? '?'}
      </span>

      <button
        onClick={() => { setBusy(true); void applyUpdate() }}
        disabled={busy}
        style={{
          padding: '7px 16px', borderRadius: 6, border: 0,
          background: busy ? 'rgba(255,255,255,0.35)' : '#fff',
          color: '#7c2d12', fontWeight: 600, fontSize: 14,
          cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
        }}
      >
        {busy ? 'Обновляем…' : 'Обновить'}
      </button>
    </div>
  )
}
