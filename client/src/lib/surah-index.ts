/**
 * The surah index — reference metadata only.
 *
 * **This file contains no Quran text.** It holds what a table of contents holds:
 * a number, the surah's name in Arabic, a transliteration, and how many ayahs it
 * has. Nothing here is scripture, translation or tafsir, and nothing here may
 * ever become those — a verse belongs to a licensed text source, which this
 * application does not yet have.
 *
 * Why it exists. `hifz_records` stores `surah_number` as a smallint between 1
 * and 114, and the Hifz form asked a learner to type that number into a bare
 * `<input type="number">`. Someone recording Ayat al-Kursi had to know it lives
 * in surah 2, and the saved record read back as "2:255-255". The stored value is
 * unchanged — this only lets the interface say "Al-Baqarah · Ayah 255" instead.
 *
 * The ayah counts are used to bound the range inputs, so a learner cannot record
 * ayah 300 of a surah that has 286.
 */

export type Surah = {
  /** 1-114. The value stored in `hifz_records.surah_number`, unchanged. */
  number: number;
  /** The surah's name in Arabic script. A name, not a verse. */
  arabic: string;
  /** Latin transliteration, for readers who do not read Arabic script. */
  transliteration: string;
  /** How many ayahs the surah has, used to bound a range. */
  ayahs: number;
};

export const surahs: readonly Surah[] = [
  { number: 1, arabic: "الفاتحة", transliteration: "Al-Fātiḥah", ayahs: 7 },
  { number: 2, arabic: "البقرة", transliteration: "Al-Baqarah", ayahs: 286 },
  { number: 3, arabic: "آل عمران", transliteration: "Āl ʿImrān", ayahs: 200 },
  { number: 4, arabic: "النساء", transliteration: "An-Nisāʾ", ayahs: 176 },
  { number: 5, arabic: "المائدة", transliteration: "Al-Māʾidah", ayahs: 120 },
  { number: 6, arabic: "الأنعام", transliteration: "Al-Anʿām", ayahs: 165 },
  { number: 7, arabic: "الأعراف", transliteration: "Al-Aʿrāf", ayahs: 206 },
  { number: 8, arabic: "الأنفال", transliteration: "Al-Anfāl", ayahs: 75 },
  { number: 9, arabic: "التوبة", transliteration: "At-Tawbah", ayahs: 129 },
  { number: 10, arabic: "يونس", transliteration: "Yūnus", ayahs: 109 },
  { number: 11, arabic: "هود", transliteration: "Hūd", ayahs: 123 },
  { number: 12, arabic: "يوسف", transliteration: "Yūsuf", ayahs: 111 },
  { number: 13, arabic: "الرعد", transliteration: "Ar-Raʿd", ayahs: 43 },
  { number: 14, arabic: "إبراهيم", transliteration: "Ibrāhīm", ayahs: 52 },
  { number: 15, arabic: "الحجر", transliteration: "Al-Ḥijr", ayahs: 99 },
  { number: 16, arabic: "النحل", transliteration: "An-Naḥl", ayahs: 128 },
  { number: 17, arabic: "الإسراء", transliteration: "Al-Isrāʾ", ayahs: 111 },
  { number: 18, arabic: "الكهف", transliteration: "Al-Kahf", ayahs: 110 },
  { number: 19, arabic: "مريم", transliteration: "Maryam", ayahs: 98 },
  { number: 20, arabic: "طه", transliteration: "Ṭā-Hā", ayahs: 135 },
  { number: 21, arabic: "الأنبياء", transliteration: "Al-Anbiyāʾ", ayahs: 112 },
  { number: 22, arabic: "الحج", transliteration: "Al-Ḥajj", ayahs: 78 },
  { number: 23, arabic: "المؤمنون", transliteration: "Al-Muʾminūn", ayahs: 118 },
  { number: 24, arabic: "النور", transliteration: "An-Nūr", ayahs: 64 },
  { number: 25, arabic: "الفرقان", transliteration: "Al-Furqān", ayahs: 77 },
  { number: 26, arabic: "الشعراء", transliteration: "Ash-Shuʿarāʾ", ayahs: 227 },
  { number: 27, arabic: "النمل", transliteration: "An-Naml", ayahs: 93 },
  { number: 28, arabic: "القصص", transliteration: "Al-Qaṣaṣ", ayahs: 88 },
  { number: 29, arabic: "العنكبوت", transliteration: "Al-ʿAnkabūt", ayahs: 69 },
  { number: 30, arabic: "الروم", transliteration: "Ar-Rūm", ayahs: 60 },
  { number: 31, arabic: "لقمان", transliteration: "Luqmān", ayahs: 34 },
  { number: 32, arabic: "السجدة", transliteration: "As-Sajdah", ayahs: 30 },
  { number: 33, arabic: "الأحزاب", transliteration: "Al-Aḥzāb", ayahs: 73 },
  { number: 34, arabic: "سبأ", transliteration: "Sabaʾ", ayahs: 54 },
  { number: 35, arabic: "فاطر", transliteration: "Fāṭir", ayahs: 45 },
  { number: 36, arabic: "يس", transliteration: "Yā-Sīn", ayahs: 83 },
  { number: 37, arabic: "الصافات", transliteration: "Aṣ-Ṣāffāt", ayahs: 182 },
  { number: 38, arabic: "ص", transliteration: "Ṣād", ayahs: 88 },
  { number: 39, arabic: "الزمر", transliteration: "Az-Zumar", ayahs: 75 },
  { number: 40, arabic: "غافر", transliteration: "Ghāfir", ayahs: 85 },
  { number: 41, arabic: "فصلت", transliteration: "Fuṣṣilat", ayahs: 54 },
  { number: 42, arabic: "الشورى", transliteration: "Ash-Shūrā", ayahs: 53 },
  { number: 43, arabic: "الزخرف", transliteration: "Az-Zukhruf", ayahs: 89 },
  { number: 44, arabic: "الدخان", transliteration: "Ad-Dukhān", ayahs: 59 },
  { number: 45, arabic: "الجاثية", transliteration: "Al-Jāthiyah", ayahs: 37 },
  { number: 46, arabic: "الأحقاف", transliteration: "Al-Aḥqāf", ayahs: 35 },
  { number: 47, arabic: "محمد", transliteration: "Muḥammad", ayahs: 38 },
  { number: 48, arabic: "الفتح", transliteration: "Al-Fatḥ", ayahs: 29 },
  { number: 49, arabic: "الحجرات", transliteration: "Al-Ḥujurāt", ayahs: 18 },
  { number: 50, arabic: "ق", transliteration: "Qāf", ayahs: 45 },
  { number: 51, arabic: "الذاريات", transliteration: "Adh-Dhāriyāt", ayahs: 60 },
  { number: 52, arabic: "الطور", transliteration: "Aṭ-Ṭūr", ayahs: 49 },
  { number: 53, arabic: "النجم", transliteration: "An-Najm", ayahs: 62 },
  { number: 54, arabic: "القمر", transliteration: "Al-Qamar", ayahs: 55 },
  { number: 55, arabic: "الرحمن", transliteration: "Ar-Raḥmān", ayahs: 78 },
  { number: 56, arabic: "الواقعة", transliteration: "Al-Wāqiʿah", ayahs: 96 },
  { number: 57, arabic: "الحديد", transliteration: "Al-Ḥadīd", ayahs: 29 },
  { number: 58, arabic: "المجادلة", transliteration: "Al-Mujādilah", ayahs: 22 },
  { number: 59, arabic: "الحشر", transliteration: "Al-Ḥashr", ayahs: 24 },
  { number: 60, arabic: "الممتحنة", transliteration: "Al-Mumtaḥanah", ayahs: 13 },
  { number: 61, arabic: "الصف", transliteration: "Aṣ-Ṣaff", ayahs: 14 },
  { number: 62, arabic: "الجمعة", transliteration: "Al-Jumuʿah", ayahs: 11 },
  { number: 63, arabic: "المنافقون", transliteration: "Al-Munāfiqūn", ayahs: 11 },
  { number: 64, arabic: "التغابن", transliteration: "At-Taghābun", ayahs: 18 },
  { number: 65, arabic: "الطلاق", transliteration: "Aṭ-Ṭalāq", ayahs: 12 },
  { number: 66, arabic: "التحريم", transliteration: "At-Taḥrīm", ayahs: 12 },
  { number: 67, arabic: "الملك", transliteration: "Al-Mulk", ayahs: 30 },
  { number: 68, arabic: "القلم", transliteration: "Al-Qalam", ayahs: 52 },
  { number: 69, arabic: "الحاقة", transliteration: "Al-Ḥāqqah", ayahs: 52 },
  { number: 70, arabic: "المعارج", transliteration: "Al-Maʿārij", ayahs: 44 },
  { number: 71, arabic: "نوح", transliteration: "Nūḥ", ayahs: 28 },
  { number: 72, arabic: "الجن", transliteration: "Al-Jinn", ayahs: 28 },
  { number: 73, arabic: "المزمل", transliteration: "Al-Muzzammil", ayahs: 20 },
  { number: 74, arabic: "المدثر", transliteration: "Al-Muddaththir", ayahs: 56 },
  { number: 75, arabic: "القيامة", transliteration: "Al-Qiyāmah", ayahs: 40 },
  { number: 76, arabic: "الإنسان", transliteration: "Al-Insān", ayahs: 31 },
  { number: 77, arabic: "المرسلات", transliteration: "Al-Mursalāt", ayahs: 50 },
  { number: 78, arabic: "النبأ", transliteration: "An-Nabaʾ", ayahs: 40 },
  { number: 79, arabic: "النازعات", transliteration: "An-Nāziʿāt", ayahs: 46 },
  { number: 80, arabic: "عبس", transliteration: "ʿAbasa", ayahs: 42 },
  { number: 81, arabic: "التكوير", transliteration: "At-Takwīr", ayahs: 29 },
  { number: 82, arabic: "الانفطار", transliteration: "Al-Infiṭār", ayahs: 19 },
  { number: 83, arabic: "المطففين", transliteration: "Al-Muṭaffifīn", ayahs: 36 },
  { number: 84, arabic: "الانشقاق", transliteration: "Al-Inshiqāq", ayahs: 25 },
  { number: 85, arabic: "البروج", transliteration: "Al-Burūj", ayahs: 22 },
  { number: 86, arabic: "الطارق", transliteration: "Aṭ-Ṭāriq", ayahs: 17 },
  { number: 87, arabic: "الأعلى", transliteration: "Al-Aʿlā", ayahs: 19 },
  { number: 88, arabic: "الغاشية", transliteration: "Al-Ghāshiyah", ayahs: 26 },
  { number: 89, arabic: "الفجر", transliteration: "Al-Fajr", ayahs: 30 },
  { number: 90, arabic: "البلد", transliteration: "Al-Balad", ayahs: 20 },
  { number: 91, arabic: "الشمس", transliteration: "Ash-Shams", ayahs: 15 },
  { number: 92, arabic: "الليل", transliteration: "Al-Layl", ayahs: 21 },
  { number: 93, arabic: "الضحى", transliteration: "Aḍ-Ḍuḥā", ayahs: 11 },
  { number: 94, arabic: "الشرح", transliteration: "Ash-Sharḥ", ayahs: 8 },
  { number: 95, arabic: "التين", transliteration: "At-Tīn", ayahs: 8 },
  { number: 96, arabic: "العلق", transliteration: "Al-ʿAlaq", ayahs: 19 },
  { number: 97, arabic: "القدر", transliteration: "Al-Qadr", ayahs: 5 },
  { number: 98, arabic: "البينة", transliteration: "Al-Bayyinah", ayahs: 8 },
  { number: 99, arabic: "الزلزلة", transliteration: "Az-Zalzalah", ayahs: 8 },
  { number: 100, arabic: "العاديات", transliteration: "Al-ʿĀdiyāt", ayahs: 11 },
  { number: 101, arabic: "القارعة", transliteration: "Al-Qāriʿah", ayahs: 11 },
  { number: 102, arabic: "التكاثر", transliteration: "At-Takāthur", ayahs: 8 },
  { number: 103, arabic: "العصر", transliteration: "Al-ʿAṣr", ayahs: 3 },
  { number: 104, arabic: "الهمزة", transliteration: "Al-Humazah", ayahs: 9 },
  { number: 105, arabic: "الفيل", transliteration: "Al-Fīl", ayahs: 5 },
  { number: 106, arabic: "قريش", transliteration: "Quraysh", ayahs: 4 },
  { number: 107, arabic: "الماعون", transliteration: "Al-Māʿūn", ayahs: 7 },
  { number: 108, arabic: "الكوثر", transliteration: "Al-Kawthar", ayahs: 3 },
  { number: 109, arabic: "الكافرون", transliteration: "Al-Kāfirūn", ayahs: 6 },
  { number: 110, arabic: "النصر", transliteration: "An-Naṣr", ayahs: 3 },
  { number: 111, arabic: "المسد", transliteration: "Al-Masad", ayahs: 5 },
  { number: 112, arabic: "الإخلاص", transliteration: "Al-Ikhlāṣ", ayahs: 4 },
  { number: 113, arabic: "الفلق", transliteration: "Al-Falaq", ayahs: 5 },
  { number: 114, arabic: "الناس", transliteration: "An-Nās", ayahs: 6 },
];

const byNumber = new Map(surahs.map((surah) => [surah.number, surah]));

/** The surah with this number, or null when the number is outside 1-114. */
export function surahByNumber(value: number | string | null | undefined): Surah | null {
  const number = Number(value);
  return Number.isFinite(number) ? byNumber.get(number) ?? null : null;
}

/** How many ayahs a surah has, used to bound a range input. 286 is the largest. */
export function ayahCount(value: number | string | null | undefined): number {
  return surahByNumber(value)?.ayahs ?? 286;
}

/**
 * A reference as a reader would say it.
 *
 * `2, 255, 255` reads "Al-Baqarah · 255"; `2, 255, 257` reads "Al-Baqarah · 255-257".
 * Falls back to the bare number when the surah is unknown, so an unexpected
 * stored value is shown rather than hidden.
 */
export function surahReference(
  surah: number | string | null | undefined,
  ayahFrom?: number | null,
  ayahTo?: number | null,
): string {
  const found = surahByNumber(surah);
  const name = found ? found.transliteration : surah == null ? "" : `Surah ${surah}`;
  if (!name) return "";
  if (ayahFrom == null) return name;
  const range = ayahTo != null && ayahTo !== ayahFrom ? `${ayahFrom}-${ayahTo}` : String(ayahFrom);
  return `${name} · ${range}`;
}

/** Options for the shared SearchableSelect: value stays the stored number. */
export function surahOptions(): Array<{ value: string; label: string }> {
  return surahs.map((surah) => ({
    value: String(surah.number),
    label: `${surah.number}. ${surah.transliteration} — ${surah.arabic}`,
  }));
}
