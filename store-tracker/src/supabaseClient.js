import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://ymeccfftobsirpruoiyl.supabase.co/rest/v1/"
const supabaseKey = "sb_publishable_Fa3BZ8MaZ-lcsHk70tzioA_F8fLDE5t"

export const supabase = createClient(supabaseUrl, supabaseKey)