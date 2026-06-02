import type { Team } from "../types";

/**
 * 48 teams of the 2026 FIFA World Cup, organized into 12 groups (A–L).
 * Names + group assignments mirror the public draw data; flag emojis use
 * regional-indicator codepoints (subdivision tag sequences for ENG/SCO).
 */
export const teams: ReadonlyArray<Team> = [
  // A
  { code: "MEX", name: "Mexico",                  flag: "🇲🇽", group: "A" },
  { code: "RSA", name: "South Africa",            flag: "🇿🇦", group: "A" },
  { code: "KOR", name: "South Korea",             flag: "🇰🇷", group: "A" },
  { code: "CZE", name: "Czech Republic",          flag: "🇨🇿", group: "A" },
  // B
  { code: "CAN", name: "Canada",                  flag: "🇨🇦", group: "B" },
  { code: "BIH", name: "Bosnia and Herzegovina",  flag: "🇧🇦", group: "B" },
  { code: "QAT", name: "Qatar",                   flag: "🇶🇦", group: "B" },
  { code: "SUI", name: "Switzerland",             flag: "🇨🇭", group: "B" },
  // C
  { code: "BRA", name: "Brazil",                  flag: "🇧🇷", group: "C" },
  { code: "MAR", name: "Morocco",                 flag: "🇲🇦", group: "C" },
  { code: "HAI", name: "Haiti",                   flag: "🇭🇹", group: "C" },
  { code: "SCO", name: "Scotland",                flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", group: "C" },
  // D
  { code: "USA", name: "United States",           flag: "🇺🇸", group: "D" },
  { code: "PAR", name: "Paraguay",                flag: "🇵🇾", group: "D" },
  { code: "AUS", name: "Australia",               flag: "🇦🇺", group: "D" },
  { code: "TUR", name: "Turkey",                  flag: "🇹🇷", group: "D" },
  // E
  { code: "GER", name: "Germany",                 flag: "🇩🇪", group: "E" },
  { code: "CUW", name: "Curaçao",                 flag: "🇨🇼", group: "E" },
  { code: "CIV", name: "Côte d'Ivoire",           flag: "🇨🇮", group: "E" },
  { code: "ECU", name: "Ecuador",                 flag: "🇪🇨", group: "E" },
  // F
  { code: "NED", name: "Netherlands",             flag: "🇳🇱", group: "F" },
  { code: "JPN", name: "Japan",                   flag: "🇯🇵", group: "F" },
  { code: "SWE", name: "Sweden",                  flag: "🇸🇪", group: "F" },
  { code: "TUN", name: "Tunisia",                 flag: "🇹🇳", group: "F" },
  // G
  { code: "BEL", name: "Belgium",                 flag: "🇧🇪", group: "G" },
  { code: "EGY", name: "Egypt",                   flag: "🇪🇬", group: "G" },
  { code: "IRN", name: "Iran",                    flag: "🇮🇷", group: "G" },
  { code: "NZL", name: "New Zealand",             flag: "🇳🇿", group: "G" },
  // H
  { code: "ESP", name: "Spain",                   flag: "🇪🇸", group: "H" },
  { code: "CPV", name: "Cape Verde",              flag: "🇨🇻", group: "H" },
  { code: "KSA", name: "Saudi Arabia",            flag: "🇸🇦", group: "H" },
  { code: "URU", name: "Uruguay",                 flag: "🇺🇾", group: "H" },
  // I
  { code: "FRA", name: "France",                  flag: "🇫🇷", group: "I" },
  { code: "SEN", name: "Senegal",                 flag: "🇸🇳", group: "I" },
  { code: "IRQ", name: "Iraq",                    flag: "🇮🇶", group: "I" },
  { code: "NOR", name: "Norway",                  flag: "🇳🇴", group: "I" },
  // J
  { code: "ARG", name: "Argentina",               flag: "🇦🇷", group: "J" },
  { code: "ALG", name: "Algeria",                 flag: "🇩🇿", group: "J" },
  { code: "AUT", name: "Austria",                 flag: "🇦🇹", group: "J" },
  { code: "JOR", name: "Jordan",                  flag: "🇯🇴", group: "J" },
  // K
  { code: "POR", name: "Portugal",                flag: "🇵🇹", group: "K" },
  { code: "COD", name: "DR Congo",                flag: "🇨🇩", group: "K" },
  { code: "UZB", name: "Uzbekistan",              flag: "🇺🇿", group: "K" },
  { code: "COL", name: "Colombia",                flag: "🇨🇴", group: "K" },
  // L
  { code: "ENG", name: "England",                 flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", group: "L" },
  { code: "CRO", name: "Croatia",                 flag: "🇭🇷", group: "L" },
  { code: "GHA", name: "Ghana",                   flag: "🇬🇭", group: "L" },
  { code: "PAN", name: "Panama",                  flag: "🇵🇦", group: "L" },
];

export const teamByCode = new Map(teams.map((t) => [t.code, t]));
