import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

export interface ProgramConfig {
  programType: 'cacfp' | 'headstart'
  isHeadStart: boolean
  fiscalYearStartMonth: number
  centerId: string | null
}

const DEFAULT_CONFIG: ProgramConfig = {
  programType: 'cacfp',
  isHeadStart: false,
  fiscalYearStartMonth: 10,
  centerId: null,
}

export function useProgramConfig(): ProgramConfig & { loading: boolean; reload: () => void } {
  const { currentCenter } = useOrg()
  const [config, setConfig] = useState<ProgramConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!currentCenter?.slug) {
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .schema('menumaker')
        .from('centers')
        .select(`
          id,
          program_type,
          fiscal_year_start_month
        `)
        .eq('slug', currentCenter.slug)
        .maybeSingle()

      if (!cancelled && data) {
        setConfig({
          programType: (data.program_type as 'cacfp' | 'headstart') ?? 'cacfp',
          isHeadStart: data.program_type === 'headstart',
          fiscalYearStartMonth: data.fiscal_year_start_month ?? 10,
          centerId: data.id ?? null,
        })
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [currentCenter?.slug, tick])

  return { ...config, loading, reload: () => setTick(t => t + 1) }
}
