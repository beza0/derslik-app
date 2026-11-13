/** Asistanın çalışma kipi: `rules` ücretsiz kural tabanlı asistandır (dil modeli değil, veri dışarı çıkmaz). */
export type AiMode = 'anthropic' | 'rules' | 'fake' | 'disabled';
export interface AiStatusDto {
  mode: AiMode;
}

export const RULES_NOTE = 'Ücretsiz basit asistan: komutları kalıplarla anlar, yapay zekâ değildir. Verileriniz dışarı gönderilmez.';

/** Kural tabanlı asistanın anladığı komut örnekleri (testlerle doğrulanan kalıplar). */
export const RULES_EXAMPLES = [
  'Bugünkü derslerim',
  "Elif'e yarın 17:00'de 60 dk ders ekle",
  "Elif'e her salı ve perşembe 18:00'de 1 saat ders ekle, 4 hafta",
  "Elif'in yarınki dersini cuma 16:00'ya taşı",
  'Gelecek hafta boş saatlerim',
  'Ödevini teslim etmeyenler',
  'Elif için not: kesirlerde zorlanıyor',
  "Elif'in durumu",
];

/** Dil modeli (Claude) bağlıyken gösterilen örnekler. */
export const AI_EXAMPLES = [
  "Elif'e gelecek haftadan başlayarak dört hafta boyunca salı ve perşembe 18.00'de birer saat ders ekle.",
  'Bu hafta hangi öğrencilerin ödevi eksik?',
  'Gelecek hafta boş saatlerim ne?',
  "Son dört ders notuna göre Ece'nin gelecek dersi için plan hazırla.",
];
