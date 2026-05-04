import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fivlogyyzxeaqhymfuey.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpdmxvZ3l5enhlYXFoeW1mdWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDQxMzUsImV4cCI6MjA5MzQ4MDEzNX0.qyhm7CWaWufZqcIDh41t8ewgMTp6G6mEYaDivWpZmaI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
