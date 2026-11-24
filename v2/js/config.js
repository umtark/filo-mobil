// Supabase bağlantısı. ANON_KEY herkese açık (public) anahtardır; veriyi korumak RLS'in işidir.
// ASLA service_role anahtarını buraya yazmayın. Anahtar: Supabase > Project Settings > API Keys > "anon public".
export const SUPABASE_URL = "https://fzrmjjnqniegxtkgoqql.supabase.co";
export const ANON_KEY = "sb_publishable_-F8njydGYCbJKsg1pqzvkA_7yvyBRDP";
// Kullanıcılar yalnızca kullanıcı adı yazar; Supabase hesabı "<ad>@KULLANICI_ALAN_ADI" biçiminde açılır.
export const KULLANICI_ALAN_ADI = "filo.local";
// Giriş ekranında şirket adı ve logosunu bulmak için işletme anahtarı (isletmeler.slug; python supabase/uygula.py supabase/marka.sql çıktısında yazar).
export const ISLETME_ANAHTARI = "olcaytur-turizm";
