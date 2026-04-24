import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ymeccfftobsirpruoiyl.supabase.co"
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_Fa3BZ8MaZ-lcsHk70tzioA_F8fLDE5t"

export const supabase = createClient(supabaseUrl, supabaseKey)