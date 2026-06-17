import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

export interface ProgramConfig {
  programType: 'cacfp' | 'headstart'
  isHeadStart: boolean
  programHours: number | null
  fiscalYearStartMonth: number
  dietitianName: string | null
  dietitianCredentials: string | null
  dietitianEmail: string | null
  healthManagerName: string | null
  healthManagerEmail: string | null
  grantNumber: string | null
  enrollmentCapacity: number | null
  centerId: string | null
}

const DEFAULT_CONFIG: ProgramConfig = {
  programType: 'cacfp',
  isHeadStart: false,
  programHours: null,
  fiscalYearStartMonth: 10,
  dietitianName: null,
  dietitianCredentials: null,
  dietitianEmail: null,
  healthManagerName: null,
  healthManagerEmail: null,
  grantNumber: null,
  enrollmentCapacity: null,
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
          program_hours,
          fiscal_year_start_month,
          dietitian_name,
          dietitian_credentials,
          dietitian_email,
          health_manager_name,
          health_manager_email,
          grant_number,
          enrollment_capacity
        `)
        .eq('slug', currentCenter.slug)
        .maybeSingle()

      if (!cancelled && data) {
        setConfig({
          programType: (data.program_type as 'cacfp' | 'headstart') ?? 'cacfp',
          isHeadStart: data.program_type === 'headstart',
          programHours: data.program_hours ?? null,
          fiscalYearStartMonth: data.fiscal_year_start_month ?? 10,
          dietitianName: data.dietitian_name ?? null,
          dietitianCredentials: data.dietitian_credentials ?? null,
          dietitianEmail: data.dietitian_email ?? null,
          healthManagerName: data.health_manager_name ?? null,
          healthManagerEmail: data.health_manager_email ?? null,
          grantNumber: data.grant_number ?? null,
          enrollmentCapacity: data.enrollment_capacity ?? null,
          centerId: data.id ?? null,
        })
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [currentCenter?.slug, tick])

  return { ...config, loading, reload: () => setTick(t => t + 1) }
}
