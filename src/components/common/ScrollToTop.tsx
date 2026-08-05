// ScrollToTop.tsx — кнопка «наверх» для длинных страниц.
//
// ЗАЧЕМ. Список бумажных заявлений Wickliffe — сотня строк; докрутив до низа,
// человек возвращается к поиску колесом через весь экран. Это та работа, которую
// делают сто раз за вечер, и она не видна ни в одном отчёте.
//
// ПОЧЕМУ ПОРОГ В ДВА ЭКРАНА. Кнопка, висящая на короткой странице, закрывает собой
// содержимое и ничего не экономит: до верха там полповорота колеса. Порог считается
// от ВЫСОТЫ ОКНА, а не от числа пикселей: на планшете повара и на мониторе офиса
// «два экрана» — разные величины.
//
// ПЛАВНО, НО НЕ ВСЕМ. `prefers-reduced-motion` — не пожелание: для части людей
// плавная прокрутка через сотню строк это тошнота. У них прыжок мгновенный.
import { useEffect, useState } from 'react'

const GREEN = '#0f4c35'

export default function ScrollToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 2)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  if (!show) return null

  const jump = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <button
      type="button" onClick={jump} className="no-print"
      aria-label="Back to top" title="Back to top"
      data-scroll-top="1"
      style={{
        position: 'fixed', right: 24, bottom: 24, zIndex: 90,
        width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: GREEN, color: '#fff', fontSize: 18, lineHeight: '44px',
        fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      ↑
    </button>
  )
}
