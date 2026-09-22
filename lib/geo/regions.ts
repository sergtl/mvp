// A "scope" is an ISO country code or one of the region codes below. Postings
// and profiles both speak in scopes, so they can be compared directly.
// Region membership is approximate: companies define EMEA, APAC etc. differently.

const list = (codes: string) => codes.split(/\s+/).filter(Boolean);

export const COUNTRY_CODES = list(`
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
  CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
  KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT
  MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
  SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG
  UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`);

// A fixed table, not Intl.DisplayNames: its output varies with each runtime's
// ICU version, which breaks server/browser hydration and text matching.
const COUNTRY_NAMES = Object.fromEntries(
  `AD Andorra|AE United Arab Emirates|AF Afghanistan|AG Antigua and Barbuda|AI Anguilla|AL Albania|AM Armenia|AO Angola|AQ Antarctica|AR Argentina|AS American Samoa|AT Austria|AU Australia|AW Aruba|AX Åland Islands|AZ Azerbaijan|
  BA Bosnia and Herzegovina|BB Barbados|BD Bangladesh|BE Belgium|BF Burkina Faso|BG Bulgaria|BH Bahrain|BI Burundi|BJ Benin|BL Saint Barthélemy|BM Bermuda|BN Brunei|BO Bolivia|BQ Caribbean Netherlands|BR Brazil|BS Bahamas|BT Bhutan|BV Bouvet Island|BW Botswana|BY Belarus|BZ Belize|
  CA Canada|CC Cocos Islands|CD Democratic Republic of the Congo|CF Central African Republic|CG Republic of the Congo|CH Switzerland|CI Côte d'Ivoire|CK Cook Islands|CL Chile|CM Cameroon|CN China|CO Colombia|CR Costa Rica|CU Cuba|CV Cabo Verde|CW Curaçao|CX Christmas Island|CY Cyprus|CZ Czechia|
  DE Germany|DJ Djibouti|DK Denmark|DM Dominica|DO Dominican Republic|DZ Algeria|EC Ecuador|EE Estonia|EG Egypt|EH Western Sahara|ER Eritrea|ES Spain|ET Ethiopia|
  FI Finland|FJ Fiji|FK Falkland Islands|FM Micronesia|FO Faroe Islands|FR France|
  GA Gabon|GB United Kingdom|GD Grenada|GE Georgia|GF French Guiana|GG Guernsey|GH Ghana|GI Gibraltar|GL Greenland|GM Gambia|GN Guinea|GP Guadeloupe|GQ Equatorial Guinea|GR Greece|GS South Georgia and the South Sandwich Islands|GT Guatemala|GU Guam|GW Guinea-Bissau|GY Guyana|
  HK Hong Kong|HM Heard Island and McDonald Islands|HN Honduras|HR Croatia|HT Haiti|HU Hungary|
  ID Indonesia|IE Ireland|IL Israel|IM Isle of Man|IN India|IO British Indian Ocean Territory|IQ Iraq|IR Iran|IS Iceland|IT Italy|
  JE Jersey|JM Jamaica|JO Jordan|JP Japan|
  KE Kenya|KG Kyrgyzstan|KH Cambodia|KI Kiribati|KM Comoros|KN Saint Kitts and Nevis|KP North Korea|KR South Korea|KW Kuwait|KY Cayman Islands|KZ Kazakhstan|
  LA Laos|LB Lebanon|LC Saint Lucia|LI Liechtenstein|LK Sri Lanka|LR Liberia|LS Lesotho|LT Lithuania|LU Luxembourg|LV Latvia|LY Libya|
  MA Morocco|MC Monaco|MD Moldova|ME Montenegro|MF Saint Martin|MG Madagascar|MH Marshall Islands|MK North Macedonia|ML Mali|MM Myanmar|MN Mongolia|MO Macao|MP Northern Mariana Islands|MQ Martinique|MR Mauritania|MS Montserrat|MT Malta|MU Mauritius|MV Maldives|MW Malawi|MX Mexico|MY Malaysia|MZ Mozambique|
  NA Namibia|NC New Caledonia|NE Niger|NF Norfolk Island|NG Nigeria|NI Nicaragua|NL Netherlands|NO Norway|NP Nepal|NR Nauru|NU Niue|NZ New Zealand|OM Oman|
  PA Panama|PE Peru|PF French Polynesia|PG Papua New Guinea|PH Philippines|PK Pakistan|PL Poland|PM Saint Pierre and Miquelon|PN Pitcairn Islands|PR Puerto Rico|PS Palestine|PT Portugal|PW Palau|PY Paraguay|QA Qatar|
  RE Réunion|RO Romania|RS Serbia|RU Russia|RW Rwanda|
  SA Saudi Arabia|SB Solomon Islands|SC Seychelles|SD Sudan|SE Sweden|SG Singapore|SH Saint Helena|SI Slovenia|SJ Svalbard and Jan Mayen|SK Slovakia|SL Sierra Leone|SM San Marino|SN Senegal|SO Somalia|SR Suriname|SS South Sudan|ST São Tomé and Príncipe|SV El Salvador|SX Sint Maarten|SY Syria|SZ Eswatini|
  TC Turks and Caicos Islands|TD Chad|TF French Southern Territories|TG Togo|TH Thailand|TJ Tajikistan|TK Tokelau|TL Timor-Leste|TM Turkmenistan|TN Tunisia|TO Tonga|TR Turkey|TT Trinidad and Tobago|TV Tuvalu|TW Taiwan|TZ Tanzania|
  UA Ukraine|UG Uganda|UM U.S. Outlying Islands|US United States|UY Uruguay|UZ Uzbekistan|
  VA Vatican City|VC Saint Vincent and the Grenadines|VE Venezuela|VG British Virgin Islands|VI U.S. Virgin Islands|VN Vietnam|VU Vanuatu|WF Wallis and Futuna|WS Samoa|
  XK Kosovo|YE Yemen|YT Mayotte|ZA South Africa|ZM Zambia|ZW Zimbabwe`
    .split("|")
    .map((entry) => [entry.trim().slice(0, 2), entry.trim().slice(3)]),
);

export const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

const countrySet = new Set(COUNTRY_CODES);

export const isCountry = (code: string) => countrySet.has(code);

const EU = list(`AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE`);
const EEA = [...EU, ...list(`IS LI NO`)];
const EUROPE = [
  ...EEA,
  ...list(`AD AL AX BA BY CH FO GB GG GI IM JE MC MD ME MK RS RU SJ SM UA VA XK`),
];
const MIDDLE_EAST = list(`AE BH IL IQ IR JO KW LB OM PS QA SA SY TR YE`);
const CAUCASUS = list(`AM AZ GE`);
const AFRICA = list(`
  AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE
  RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW
`);

export const REGIONS = {
  WORLDWIDE: { label: "Worldwide", countries: COUNTRY_CODES },
  EU: { label: "European Union", countries: EU },
  EEA: { label: "European Economic Area", countries: EEA },
  EUROPE: { label: "Europe", countries: EUROPE },
  EMEA: {
    label: "EMEA",
    countries: [...EUROPE, ...MIDDLE_EAST, ...CAUCASUS, ...AFRICA],
  },
  NA: { label: "North America (US & Canada)", countries: list(`US CA`) },
  LATAM: {
    label: "Latin America",
    countries: list(`
      AR BO BR BZ CL CO CR CU DO EC GF GT GY HN MX NI PA PE PR PY SR SV UY VE
    `),
  },
  APAC: {
    label: "Asia-Pacific",
    countries: list(`
      AU BD BN BT CK CN FJ FM GU HK ID IN JP KH KI KR LA LK MH MM MN MO MV MY NC NP NR NZ PF PG PH PK PW SB SG TH TO TV
      TW VN VU WS
    `),
  },
} satisfies Record<string, { label: string; countries: string[] }>;

export type RegionCode = keyof typeof REGIONS;

export const REGION_CODES = Object.keys(REGIONS) as RegionCode[];

export const isRegion = (scope: string): scope is RegionCode =>
  Object.hasOwn(REGIONS, scope);

export const isScope = (scope: string) => isRegion(scope) || isCountry(scope);

export const isEU = (code: string) => EU.includes(code);

export const scopeLabel = (scope: string) =>
  isRegion(scope) ? REGIONS[scope].label : countryName(scope);

export function expandScope(scope: string): ReadonlySet<string> {
  if (isRegion(scope)) return new Set(REGIONS[scope].countries);

  return isCountry(scope) ? new Set([scope]) : new Set();
}

// True when every country in `target` is inside `scope`.
export function scopeCovers(scope: string, target: string) {
  const inside = expandScope(scope);
  const wanted = expandScope(target);

  return wanted.size > 0 && [...wanted].every((code) => inside.has(code));
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase();

// Ordered without locale collation, which also varies between runtimes.
export const COUNTRIES = COUNTRY_CODES.map((code) => ({
  code,
  name: countryName(code),
})).sort((a, b) => {
  const [x, y] = [a.name, b.name].map(normalize);

  return x < y ? -1 : x > y ? 1 : 0;
});

const aliases: Record<string, string> = {
  turkiye: "TR",
  "united states of america": "US",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  "republic of ireland": "IE",
  "czech republic": "CZ",
  turkey: "TR",
  holland: "NL",
  "the netherlands": "NL",
  "hong kong": "HK",
  macau: "MO",
  macao: "MO",
  "ivory coast": "CI",
  palestine: "PS",
  "bosnia and herzegovina": "BA",
  bosnia: "BA",
  "trinidad and tobago": "TT",
  burma: "MM",
  macedonia: "MK",
  swaziland: "SZ",
  "cape verde": "CV",
  "european union": "EU",
  "european economic area": "EEA",
};

const names = new Map<string, string>();

for (const code of COUNTRY_CODES)
  names.set(normalize(countryName(code)), code);

for (const [alias, scope] of Object.entries(aliases)) names.set(alias, scope);

const namePattern = new RegExp(
  `(?<![a-z])(${[...names.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(?![a-z])`,
  "g",
);

// Abbreviations are matched case-sensitively so "us" (pronoun) is never the US.
const abbreviations: [RegExp, string][] = [
  [/(?<![A-Za-z])(?:US|USA|U\.S\.A?\.?)(?![A-Za-z])/, "US"],
  [/(?<![A-Za-z])(?:UK|U\.K\.)(?![A-Za-z])/, "GB"],
  [/(?<![A-Za-z])UAE(?![A-Za-z])/, "AE"],
  [/(?<![A-Za-z])EU(?![A-Za-z])/, "EU"],
  [/(?<![A-Za-z])EEA(?![A-Za-z])/, "EEA"],
];

// Scopes a question names. Callers should act only when exactly one is found;
// "Georgia" deliberately reports both the country and the US state.
export function scopesInText(text: string) {
  const found = new Set<string>();

  for (const [pattern, scope] of abbreviations)
    if (pattern.test(text)) found.add(scope);

  for (const match of normalize(text).matchAll(namePattern)) {
    found.add(names.get(match[1])!);
    if (match[1] === "georgia") found.add("US");
  }

  return [...found];
}
