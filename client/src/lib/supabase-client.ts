import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKeyFrom, supabaseUrlFrom } from "./supabase-browser-env";

// Both names for the same key, because Supabase renamed anon -> publishable. See the module.
const url = supabaseUrlFrom();
const publishableKey = supabasePublishableKeyFrom();

export const supabaseClient: SupabaseClient | null = url && publishableKey
  ? createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export const isSupabaseBrowserConfigured = Boolean(supabaseClient);
