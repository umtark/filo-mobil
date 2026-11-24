// İşletme markasını (ad + logo) doğrulayan saf fonksiyon; testleri testler/marka_test.mjs altında.
export const VARSAYILAN_MARKA = { ad: "Filo Muhasebe", logo: "ikon-192.png" };
// Yalnızca raster veri adresi: SVG ve diğer şemalar (javascript: vb.) kabul edilmez.
const LOGO_DESENI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const AZAMI_LOGO = 120000;
const AZAMI_AD = 80;

export function markaNormalle(ham, varsayilan = VARSAYILAN_MARKA) {
  const ad = ham && typeof ham.ad === "string" ? ham.ad.trim().slice(0, AZAMI_AD) : "";
  const logo = ham && typeof ham.logo === "string" && ham.logo.length <= AZAMI_LOGO && LOGO_DESENI.test(ham.logo) ? ham.logo : "";
  return { ad: ad || varsayilan.ad, logo: logo || varsayilan.logo };
}
