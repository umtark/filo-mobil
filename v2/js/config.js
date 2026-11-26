// Supabase bağlantısı. ANON_KEY herkese açık (public) anahtardır; veriyi korumak RLS'in işidir.
// ASLA service_role anahtarını buraya yazmayın. Anahtar: Supabase > Project Settings > API Keys > "anon public".
export const SUPABASE_URL = "https://fzrmjjnqniegxtkgoqql.supabase.co";
export const ANON_KEY = "sb_publishable_-F8njydGYCbJKsg1pqzvkA_7yvyBRDP";
// Her şirket giriş e-postasında kendi alan adını taşır ("<kullanıcı>@<alan>"). Alan adı sunucudan (marka_getir) öğrenilir.
// Şirket kodu 6 haneli rakamdır ve sistem üretir.
// Tek şirketlik özel kurulumlarda giriş ekranında önceden yazılı gelen şirket kodu. Çok şirketli ortak adreste BOŞ bırakın:
// kullanıcılar kodu bir kez yazar (ya da size verdiğiniz ...?i=482915 bağlantısını açar) ve cihaz hatırlar.
export const VARSAYILAN_SIRKET = "";
// Şirketlere özel alt alan adı kullanacaksanız kök alan adı (örn. "filomuhasebe.com"): 482915.filomuhasebe.com adresi "482915" kodunu kendiliğinden seçer.
export const ALT_ALAN_KOKU = "";
// Web Push (bildirim) için herkese açık VAPID anahtarı; özel anahtar yalnızca sunucuda (Edge Function sırrı) durur.
export const VAPID_ANAHTARI = "BEi_hhHyYuIIu0-S-Gn1rBik-1q83ZCIheQDsEduDvlPC_kPwCO3CfJrZd_H-QO6xMI4itpEHovAf_c5o4ds4Ag";
