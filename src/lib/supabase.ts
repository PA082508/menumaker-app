import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

export type Database = {
  menumaker: {
    Tables: {
      recipes: {
        Row: {
          id: string
          name: string
          program: string
          base_yield: number
          is_active: boolean
          is_purchased: boolean
          allergens: string[]
          contains_beef: boolean
          is_vegetarian: boolean
          preference_score: number
          cost_tier: string
          season: string[]
          admin_notes: string | null
          source_notes: string | null
        }
      }
      menu_cycles: {
        Row: {
          id: string
          program: string
          name: string
          total_weeks: number
          status: string
          approved_by: string | null
          approved_at: string | null
        }
      }
      menu_items: {
        Row: {
          id: string
          cycle_id: string
          week_number: number
          day_of_week: number
          meal_type_id: string
          component_id: string
          item_text: string | null
          recipe_id: string | null
          is_extra: boolean
        }
      }
      centers: {
        Row: {
          id: string
          slug: string
          name: string
          is_active: boolean
        }
      }
      holidays: {
        Row: {
          id: string
          year: number
          month: number
          day: number
          name: string
          type: string
          source: string
        }
      }
    }
  }
}
