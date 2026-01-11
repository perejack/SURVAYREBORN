const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://zszyczdpcjjlhnptytsi.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzenljemRwY2pqbGhucHR5dHNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4Mzk2OTIsImV4cCI6MjA4MTQxNTY5Mn0.Wm2L92Je7MNH4trkhS7STI2_38uJDnVS-7NAZgmvjGs'

const supabase = createClient(supabaseUrl, supabaseKey)

module.exports = { supabase }
