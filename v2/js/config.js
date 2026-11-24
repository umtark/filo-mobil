// Supabase bağlantısı. ANON_KEY herkese açık (public) anahtardır; veriyi korumak RLS'in işidir.
// ASLA service_role anahtarını buraya yazmayın. Anahtar: Supabase > Project Settings > API Keys > "anon public".
export const SUPABASE_URL = "https://fzrmjjnqniegxtkgoqql.supabase.co";
export const ANON_KEY = "sb_publishable_-F8njydGYCbJKsg1pqzvkA_7yvyBRDP";
// Her şirket giriş e-postasında kendi alan adını taşır: "<kullanıcı>@<şirket-kodu>.filo.local". Alan adı sunucudan (marka_getir) öğrenilir.
// Tek şirketlik özel kurulumlarda giriş ekranında önceden yazılı gelen şirket kodu. Çok şirketli ortak adreste BOŞ bırakın:
// kullanıcılar kodu bir kez yazar (ya da size verdiğiniz ...?i=kod bağlantısını açar) ve cihaz hatırlar.
export const VARSAYILAN_SIRKET = "";
// Şirketlere özel alt alan adı kullanacaksanız kök alan adı (örn. "filomuhasebe.com"): abc.filomuhasebe.com adresi "abc" kodunu kendiliğinden seçer.
export const ALT_ALAN_KOKU = "";
