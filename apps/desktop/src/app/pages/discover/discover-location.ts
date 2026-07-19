/**
 * Location recognition for the Discover feed.
 *
 * Turns a free-text job location ("Berlin, Germany", "Austin, TX",
 * "Sao Paulo, Brazil", "Remote - US") into a stable {country, city, region}.
 * Anything unrecognized (remote-only, empty, unknown text) returns an empty
 * country and rolls into the Other bucket - a normal, selectable filter option,
 * never an always-pass.
 *
 * Why this shape (learn from the earlier fragile version):
 * - Country NAMES and city names match as whole words anywhere in the string,
 *   so "priorities" never triggers the city "Rio".
 * - Short CODES (ISO2, US state / Canadian province abbreviations) are ambiguous
 *   as substrings ("ca" in "Chicago", "de" in "Dresden", "in" in "engineering"),
 *   so a code matches ONLY when it is a standalone comma segment ("berlin, de")
 *   or an UPPERCASE standalone token in the original text ("Austin, TX"). Bare
 *   lowercase English words ("no", "is", "in") therefore never false-trigger.
 * - Cities are checked first (most specific), then US states / CA provinces,
 *   then country name/code, then region-generic fallbacks.
 *
 * This module is pure and unit-tested (discover-location.spec.ts) precisely so
 * we stop re-litigating location classification every few weeks.
 */

export type RegionKey =
  | 'europe'
  | 'namerica'
  | 'samerica'
  | 'asia'
  | 'oceania'
  | 'mena'
  | 'africa'
  | 'other';

/** Deterministic classification of one free-text location. */
export interface LocClass {
  country: string;
  city: string;
  region: RegionKey;
}

interface CityDef {
  name: string;
  /** Whole-word tokens that name this city (localized spellings, abbreviations). */
  tokens: string[];
}

interface CountryDef {
  name: string;
  region: RegionKey;
  /** Long, unambiguous names matched as whole words anywhere ('germany', 'usa'). */
  names: string[];
  /** Short codes matched only as a standalone segment / UPPERCASE token ('de'). */
  codes?: string[];
  cities?: CityDef[];
}

/** A US state (or DC): full name matched anywhere, code as a standalone token. */
interface RegionCode {
  name: string;
  code: string;
}

/** Region display order in the Locations popover. */
export const REGION_ORDER: RegionKey[] = [
  'europe',
  'namerica',
  'samerica',
  'asia',
  'oceania',
  'mena',
  'africa',
  'other',
];

export const OTHER_COUNTRY = 'Other';

const USA = 'United States';
const CANADA = 'Canada';

/**
 * US states + DC. Codes like CA/IL/OR/IN are deliberately kept OFF the Canada /
 * Colombia / Israel / Indiana-vs-word lists and resolved here first, because in
 * job postings "SF, CA" means California far more often than Canada.
 */
const US_STATES: RegionCode[] = [
  { name: 'alabama', code: 'AL' },
  { name: 'alaska', code: 'AK' },
  { name: 'arizona', code: 'AZ' },
  { name: 'arkansas', code: 'AR' },
  { name: 'california', code: 'CA' },
  { name: 'colorado', code: 'CO' },
  { name: 'connecticut', code: 'CT' },
  { name: 'delaware', code: 'DE' },
  { name: 'florida', code: 'FL' },
  { name: 'georgia', code: 'GA' },
  { name: 'hawaii', code: 'HI' },
  { name: 'idaho', code: 'ID' },
  { name: 'illinois', code: 'IL' },
  { name: 'indiana', code: 'IN' },
  { name: 'iowa', code: 'IA' },
  { name: 'kansas', code: 'KS' },
  { name: 'kentucky', code: 'KY' },
  { name: 'louisiana', code: 'LA' },
  { name: 'maine', code: 'ME' },
  { name: 'maryland', code: 'MD' },
  { name: 'massachusetts', code: 'MA' },
  { name: 'michigan', code: 'MI' },
  { name: 'minnesota', code: 'MN' },
  { name: 'mississippi', code: 'MS' },
  { name: 'missouri', code: 'MO' },
  { name: 'montana', code: 'MT' },
  { name: 'nebraska', code: 'NE' },
  { name: 'nevada', code: 'NV' },
  { name: 'new hampshire', code: 'NH' },
  { name: 'new jersey', code: 'NJ' },
  { name: 'new mexico', code: 'NM' },
  { name: 'north carolina', code: 'NC' },
  { name: 'north dakota', code: 'ND' },
  { name: 'ohio', code: 'OH' },
  { name: 'oklahoma', code: 'OK' },
  { name: 'oregon', code: 'OR' },
  { name: 'pennsylvania', code: 'PA' },
  { name: 'rhode island', code: 'RI' },
  { name: 'south carolina', code: 'SC' },
  { name: 'south dakota', code: 'SD' },
  { name: 'tennessee', code: 'TN' },
  { name: 'texas', code: 'TX' },
  { name: 'utah', code: 'UT' },
  { name: 'vermont', code: 'VT' },
  { name: 'virginia', code: 'VA' },
  { name: 'washington state', code: 'WA' },
  { name: 'west virginia', code: 'WV' },
  { name: 'wisconsin', code: 'WI' },
  { name: 'wyoming', code: 'WY' },
  { name: 'district of columbia', code: 'DC' },
];

/**
 * Canadian provinces. NL (Newfoundland) is intentionally omitted - it collides
 * with the far more common Netherlands code; "Canada" or another province token
 * still classifies those jobs.
 */
const CA_PROVINCES: RegionCode[] = [
  { name: 'ontario', code: 'ON' },
  { name: 'quebec', code: 'QC' },
  { name: 'british columbia', code: 'BC' },
  { name: 'alberta', code: 'AB' },
  { name: 'manitoba', code: 'MB' },
  { name: 'saskatchewan', code: 'SK' },
  { name: 'nova scotia', code: 'NS' },
  { name: 'new brunswick', code: 'NB' },
];

const COUNTRY_DEFS: CountryDef[] = [
  // ---- Europe ----
  {
    name: 'Germany',
    region: 'europe',
    names: ['germany', 'deutschland'],
    codes: ['de'],
    cities: [
      { name: 'Berlin', tokens: ['berlin'] },
      { name: 'Munich', tokens: ['munich', 'muenchen', 'munchen', 'münchen'] },
      { name: 'Hamburg', tokens: ['hamburg'] },
      { name: 'Frankfurt', tokens: ['frankfurt'] },
      { name: 'Cologne', tokens: ['cologne', 'koeln', 'köln'] },
      { name: 'Stuttgart', tokens: ['stuttgart'] },
      { name: 'Duesseldorf', tokens: ['duesseldorf', 'düsseldorf', 'dusseldorf'] },
      { name: 'Leipzig', tokens: ['leipzig'] },
    ],
  },
  {
    name: 'United Kingdom',
    region: 'europe',
    names: ['united kingdom', 'england', 'scotland', 'wales', 'great britain', 'britain'],
    codes: ['uk', 'gb'],
    cities: [
      { name: 'London', tokens: ['london'] },
      { name: 'Manchester', tokens: ['manchester'] },
      { name: 'Edinburgh', tokens: ['edinburgh'] },
      { name: 'Birmingham', tokens: ['birmingham'] },
      { name: 'Glasgow', tokens: ['glasgow'] },
      { name: 'Bristol', tokens: ['bristol'] },
    ],
  },
  {
    name: 'France',
    region: 'europe',
    names: ['france'],
    codes: ['fr'],
    cities: [
      { name: 'Paris', tokens: ['paris'] },
      { name: 'Lyon', tokens: ['lyon'] },
      { name: 'Marseille', tokens: ['marseille'] },
      { name: 'Toulouse', tokens: ['toulouse'] },
    ],
  },
  {
    name: 'Netherlands',
    region: 'europe',
    names: ['netherlands', 'holland'],
    codes: ['nl'],
    cities: [
      { name: 'Amsterdam', tokens: ['amsterdam'] },
      { name: 'Rotterdam', tokens: ['rotterdam'] },
      { name: 'Utrecht', tokens: ['utrecht'] },
      { name: 'Eindhoven', tokens: ['eindhoven'] },
      { name: 'The Hague', tokens: ['the hague', 'den haag'] },
    ],
  },
  {
    name: 'Spain',
    region: 'europe',
    names: ['spain', 'españa', 'espana'],
    codes: ['es'],
    cities: [
      { name: 'Madrid', tokens: ['madrid'] },
      { name: 'Barcelona', tokens: ['barcelona'] },
      { name: 'Valencia', tokens: ['valencia'] },
      { name: 'Seville', tokens: ['seville', 'sevilla'] },
    ],
  },
  {
    name: 'Portugal',
    region: 'europe',
    names: ['portugal'],
    codes: ['pt'],
    cities: [
      { name: 'Lisbon', tokens: ['lisbon', 'lisboa'] },
      { name: 'Porto', tokens: ['porto'] },
    ],
  },
  {
    name: 'Italy',
    region: 'europe',
    names: ['italy', 'italia'],
    codes: ['it'],
    cities: [
      { name: 'Rome', tokens: ['rome', 'roma'] },
      { name: 'Milan', tokens: ['milan', 'milano'] },
      { name: 'Turin', tokens: ['turin', 'torino'] },
      { name: 'Naples', tokens: ['naples', 'napoli'] },
    ],
  },
  {
    name: 'Poland',
    region: 'europe',
    names: ['poland', 'polska'],
    codes: ['pl'],
    cities: [
      { name: 'Warsaw', tokens: ['warsaw', 'warszawa'] },
      { name: 'Krakow', tokens: ['krakow', 'kraków', 'cracow'] },
      { name: 'Wroclaw', tokens: ['wroclaw', 'wrocław'] },
    ],
  },
  {
    name: 'Ireland',
    region: 'europe',
    names: ['ireland'],
    codes: ['ie'],
    cities: [
      { name: 'Dublin', tokens: ['dublin'] },
      { name: 'Cork', tokens: ['cork'] },
    ],
  },
  {
    name: 'Switzerland',
    region: 'europe',
    names: ['switzerland', 'schweiz', 'suisse'],
    codes: ['ch'],
    cities: [
      { name: 'Zurich', tokens: ['zurich', 'zürich', 'zuerich'] },
      { name: 'Geneva', tokens: ['geneva', 'genève', 'geneve'] },
      { name: 'Basel', tokens: ['basel'] },
      { name: 'Bern', tokens: ['bern'] },
      { name: 'Lausanne', tokens: ['lausanne'] },
    ],
  },
  {
    name: 'Austria',
    region: 'europe',
    names: ['austria', 'österreich', 'osterreich'],
    codes: ['at'],
    cities: [
      { name: 'Vienna', tokens: ['vienna', 'wien'] },
      { name: 'Graz', tokens: ['graz'] },
      { name: 'Linz', tokens: ['linz'] },
      { name: 'Salzburg', tokens: ['salzburg'] },
    ],
  },
  {
    name: 'Sweden',
    region: 'europe',
    names: ['sweden', 'sverige'],
    codes: ['se'],
    cities: [
      { name: 'Stockholm', tokens: ['stockholm'] },
      { name: 'Gothenburg', tokens: ['gothenburg', 'göteborg', 'goteborg'] },
      { name: 'Malmo', tokens: ['malmo', 'malmö'] },
    ],
  },
  {
    name: 'Denmark',
    region: 'europe',
    names: ['denmark', 'danmark'],
    codes: ['dk'],
    cities: [
      { name: 'Copenhagen', tokens: ['copenhagen', 'københavn', 'kobenhavn'] },
      { name: 'Aarhus', tokens: ['aarhus', 'århus'] },
    ],
  },
  {
    name: 'Norway',
    region: 'europe',
    names: ['norway', 'norge'],
    codes: ['no'],
    cities: [
      { name: 'Oslo', tokens: ['oslo'] },
      { name: 'Bergen', tokens: ['bergen'] },
      { name: 'Trondheim', tokens: ['trondheim'] },
      { name: 'Stavanger', tokens: ['stavanger'] },
    ],
  },
  {
    name: 'Finland',
    region: 'europe',
    names: ['finland', 'suomi'],
    codes: ['fi'],
    cities: [
      { name: 'Helsinki', tokens: ['helsinki'] },
      { name: 'Espoo', tokens: ['espoo'] },
      { name: 'Tampere', tokens: ['tampere'] },
    ],
  },
  {
    name: 'Belgium',
    region: 'europe',
    names: ['belgium', 'belgië', 'belgie', 'belgique'],
    codes: ['be'],
    cities: [
      { name: 'Brussels', tokens: ['brussels', 'bruxelles', 'brussel'] },
      { name: 'Antwerp', tokens: ['antwerp', 'antwerpen'] },
      { name: 'Ghent', tokens: ['ghent', 'gent'] },
    ],
  },
  {
    name: 'Czechia',
    region: 'europe',
    names: ['czechia', 'czech republic', 'czech'],
    codes: ['cz'],
    cities: [
      { name: 'Prague', tokens: ['prague', 'praha'] },
      { name: 'Brno', tokens: ['brno'] },
    ],
  },
  {
    name: 'Romania',
    region: 'europe',
    names: ['romania'],
    codes: ['ro'],
    cities: [
      { name: 'Bucharest', tokens: ['bucharest', 'bucuresti', 'bucurești'] },
      { name: 'Cluj', tokens: ['cluj'] },
    ],
  },
  {
    name: 'Ukraine',
    region: 'europe',
    names: ['ukraine'],
    codes: ['ua'],
    cities: [
      { name: 'Kyiv', tokens: ['kyiv', 'kiev'] },
      { name: 'Lviv', tokens: ['lviv'] },
      { name: 'Kharkiv', tokens: ['kharkiv'] },
    ],
  },
  {
    name: 'Estonia',
    region: 'europe',
    names: ['estonia'],
    codes: ['ee'],
    cities: [{ name: 'Tallinn', tokens: ['tallinn'] }],
  },
  {
    name: 'Latvia',
    region: 'europe',
    names: ['latvia'],
    codes: ['lv'],
    cities: [{ name: 'Riga', tokens: ['riga'] }],
  },
  {
    name: 'Lithuania',
    region: 'europe',
    names: ['lithuania'],
    codes: ['lt'],
    cities: [{ name: 'Vilnius', tokens: ['vilnius'] }],
  },
  {
    name: 'Greece',
    region: 'europe',
    names: ['greece'],
    codes: ['gr'],
    cities: [
      { name: 'Athens', tokens: ['athens'] },
      { name: 'Thessaloniki', tokens: ['thessaloniki'] },
    ],
  },
  {
    name: 'Hungary',
    region: 'europe',
    names: ['hungary'],
    codes: ['hu'],
    cities: [{ name: 'Budapest', tokens: ['budapest'] }],
  },
  {
    name: 'Slovakia',
    region: 'europe',
    names: ['slovakia'],
    codes: ['sk'],
    cities: [{ name: 'Bratislava', tokens: ['bratislava'] }],
  },
  {
    name: 'Slovenia',
    region: 'europe',
    names: ['slovenia'],
    codes: ['si'],
    cities: [{ name: 'Ljubljana', tokens: ['ljubljana'] }],
  },
  {
    name: 'Croatia',
    region: 'europe',
    names: ['croatia'],
    codes: ['hr'],
    cities: [
      { name: 'Zagreb', tokens: ['zagreb'] },
      { name: 'Split', tokens: ['split'] },
    ],
  },
  {
    name: 'Bulgaria',
    region: 'europe',
    names: ['bulgaria'],
    codes: ['bg'],
    cities: [{ name: 'Sofia', tokens: ['sofia'] }],
  },
  {
    name: 'Serbia',
    region: 'europe',
    names: ['serbia'],
    codes: ['rs'],
    cities: [
      { name: 'Belgrade', tokens: ['belgrade', 'beograd'] },
      { name: 'Novi Sad', tokens: ['novi sad'] },
    ],
  },
  { name: 'Luxembourg', region: 'europe', names: ['luxembourg'], codes: ['lu'] },
  { name: 'Malta', region: 'europe', names: ['malta'], codes: ['mt'] },
  { name: 'Cyprus', region: 'europe', names: ['cyprus'], codes: ['cy'] },
  {
    name: 'Iceland',
    region: 'europe',
    names: ['iceland'],
    codes: ['is'],
    cities: [{ name: 'Reykjavik', tokens: ['reykjavik', 'reykjavík'] }],
  },
  // ---- North America ----
  {
    name: USA,
    region: 'namerica',
    names: ['united states', 'u.s.a', 'u.s.', 'usa', 'america'],
    codes: ['us'],
    cities: [
      { name: 'New York', tokens: ['new york', 'nyc', 'brooklyn'] },
      { name: 'San Francisco', tokens: ['san francisco', 'sf', 'sfo'] },
      { name: 'Seattle', tokens: ['seattle'] },
      { name: 'Austin', tokens: ['austin'] },
      { name: 'Boston', tokens: ['boston'] },
      { name: 'Chicago', tokens: ['chicago'] },
      { name: 'Los Angeles', tokens: ['los angeles'] },
      { name: 'Denver', tokens: ['denver'] },
      { name: 'Miami', tokens: ['miami'] },
      { name: 'Atlanta', tokens: ['atlanta'] },
      { name: 'Dallas', tokens: ['dallas'] },
      { name: 'Houston', tokens: ['houston'] },
      { name: 'Washington', tokens: ['washington dc', 'washington, d.c'] },
      { name: 'Portland', tokens: ['portland'] },
      { name: 'San Diego', tokens: ['san diego'] },
      { name: 'Phoenix', tokens: ['phoenix'] },
      { name: 'Philadelphia', tokens: ['philadelphia'] },
      { name: 'Nashville', tokens: ['nashville'] },
      { name: 'Raleigh', tokens: ['raleigh'] },
      { name: 'San Jose', tokens: ['san jose'] },
    ],
  },
  {
    name: CANADA,
    region: 'namerica',
    names: ['canada'],
    cities: [
      { name: 'Toronto', tokens: ['toronto'] },
      { name: 'Vancouver', tokens: ['vancouver'] },
      { name: 'Montreal', tokens: ['montreal', 'montréal'] },
      { name: 'Ottawa', tokens: ['ottawa'] },
      { name: 'Calgary', tokens: ['calgary'] },
      { name: 'Edmonton', tokens: ['edmonton'] },
      { name: 'Waterloo', tokens: ['waterloo'] },
    ],
  },
  {
    name: 'Mexico',
    region: 'namerica',
    names: ['mexico', 'méxico'],
    codes: ['mx'],
    cities: [
      { name: 'Mexico City', tokens: ['mexico city', 'cdmx'] },
      { name: 'Guadalajara', tokens: ['guadalajara'] },
      { name: 'Monterrey', tokens: ['monterrey'] },
    ],
  },
  // ---- South America ----
  {
    name: 'Brazil',
    region: 'samerica',
    names: ['brazil', 'brasil'],
    codes: ['br'],
    cities: [
      { name: 'Sao Paulo', tokens: ['sao paulo', 'são paulo'] },
      { name: 'Rio de Janeiro', tokens: ['rio de janeiro'] },
      { name: 'Brasilia', tokens: ['brasilia', 'brasília'] },
      { name: 'Belo Horizonte', tokens: ['belo horizonte'] },
      { name: 'Curitiba', tokens: ['curitiba'] },
      { name: 'Porto Alegre', tokens: ['porto alegre'] },
      { name: 'Florianopolis', tokens: ['florianopolis', 'florianópolis'] },
    ],
  },
  {
    name: 'Argentina',
    region: 'samerica',
    names: ['argentina'],
    codes: ['ar'],
    cities: [
      { name: 'Buenos Aires', tokens: ['buenos aires'] },
      { name: 'Cordoba', tokens: ['cordoba', 'córdoba'] },
      { name: 'Rosario', tokens: ['rosario'] },
    ],
  },
  {
    name: 'Chile',
    region: 'samerica',
    names: ['chile'],
    codes: ['cl'],
    cities: [
      { name: 'Santiago', tokens: ['santiago'] },
      { name: 'Valparaiso', tokens: ['valparaiso', 'valparaíso'] },
    ],
  },
  {
    name: 'Uruguay',
    region: 'samerica',
    names: ['uruguay'],
    codes: ['uy'],
    cities: [{ name: 'Montevideo', tokens: ['montevideo'] }],
  },
  {
    name: 'Colombia',
    region: 'samerica',
    names: ['colombia'],
    cities: [
      { name: 'Bogota', tokens: ['bogota', 'bogotá'] },
      { name: 'Medellin', tokens: ['medellin', 'medellín'] },
      { name: 'Cali', tokens: ['cali'] },
    ],
  },
  {
    name: 'Peru',
    region: 'samerica',
    names: ['peru', 'perú'],
    codes: ['pe'],
    cities: [{ name: 'Lima', tokens: ['lima'] }],
  },
  {
    name: 'Ecuador',
    region: 'samerica',
    names: ['ecuador'],
    cities: [
      { name: 'Quito', tokens: ['quito'] },
      { name: 'Guayaquil', tokens: ['guayaquil'] },
    ],
  },
  {
    name: 'Bolivia',
    region: 'samerica',
    names: ['bolivia'],
    cities: [{ name: 'La Paz', tokens: ['la paz'] }],
  },
  {
    name: 'Paraguay',
    region: 'samerica',
    names: ['paraguay'],
    cities: [{ name: 'Asuncion', tokens: ['asuncion', 'asunción'] }],
  },
  {
    name: 'Venezuela',
    region: 'samerica',
    names: ['venezuela'],
    cities: [{ name: 'Caracas', tokens: ['caracas'] }],
  },
  // ---- Asia ----
  {
    name: 'India',
    region: 'asia',
    names: ['india'],
    codes: ['in'],
    cities: [
      { name: 'Bangalore', tokens: ['bangalore', 'bengaluru'] },
      { name: 'Mumbai', tokens: ['mumbai'] },
      { name: 'Delhi', tokens: ['delhi', 'new delhi'] },
      { name: 'Hyderabad', tokens: ['hyderabad'] },
      { name: 'Pune', tokens: ['pune'] },
      { name: 'Chennai', tokens: ['chennai'] },
    ],
  },
  { name: 'Singapore', region: 'asia', names: ['singapore'], codes: ['sg'] },
  {
    name: 'Japan',
    region: 'asia',
    names: ['japan'],
    codes: ['jp'],
    cities: [
      { name: 'Tokyo', tokens: ['tokyo'] },
      { name: 'Osaka', tokens: ['osaka'] },
    ],
  },
  {
    name: 'China',
    region: 'asia',
    names: ['china'],
    codes: ['cn'],
    cities: [
      { name: 'Beijing', tokens: ['beijing'] },
      { name: 'Shanghai', tokens: ['shanghai'] },
      { name: 'Shenzhen', tokens: ['shenzhen'] },
    ],
  },
  { name: 'Hong Kong', region: 'asia', names: ['hong kong'], codes: ['hk'] },
  {
    name: 'Taiwan',
    region: 'asia',
    names: ['taiwan'],
    codes: ['tw'],
    cities: [{ name: 'Taipei', tokens: ['taipei'] }],
  },
  {
    name: 'South Korea',
    region: 'asia',
    names: ['south korea', 'korea'],
    codes: ['kr'],
    cities: [{ name: 'Seoul', tokens: ['seoul'] }],
  },
  {
    name: 'Vietnam',
    region: 'asia',
    names: ['vietnam'],
    codes: ['vn'],
    cities: [
      { name: 'Hanoi', tokens: ['hanoi'] },
      { name: 'Ho Chi Minh City', tokens: ['ho chi minh', 'saigon'] },
    ],
  },
  {
    name: 'Philippines',
    region: 'asia',
    names: ['philippines'],
    codes: ['ph'],
    cities: [
      { name: 'Manila', tokens: ['manila'] },
      { name: 'Cebu', tokens: ['cebu'] },
    ],
  },
  {
    name: 'Indonesia',
    region: 'asia',
    names: ['indonesia'],
    codes: ['id'],
    cities: [{ name: 'Jakarta', tokens: ['jakarta'] }],
  },
  {
    name: 'Malaysia',
    region: 'asia',
    names: ['malaysia'],
    codes: ['my'],
    cities: [{ name: 'Kuala Lumpur', tokens: ['kuala lumpur'] }],
  },
  {
    name: 'Thailand',
    region: 'asia',
    names: ['thailand'],
    codes: ['th'],
    cities: [{ name: 'Bangkok', tokens: ['bangkok'] }],
  },
  {
    name: 'Pakistan',
    region: 'asia',
    names: ['pakistan'],
    codes: ['pk'],
    cities: [
      { name: 'Karachi', tokens: ['karachi'] },
      { name: 'Lahore', tokens: ['lahore'] },
    ],
  },
  {
    name: 'Bangladesh',
    region: 'asia',
    names: ['bangladesh'],
    codes: ['bd'],
    cities: [{ name: 'Dhaka', tokens: ['dhaka'] }],
  },
  // ---- Oceania ----
  {
    name: 'Australia',
    region: 'oceania',
    names: ['australia'],
    codes: ['au'],
    cities: [
      { name: 'Sydney', tokens: ['sydney'] },
      { name: 'Melbourne', tokens: ['melbourne'] },
      { name: 'Brisbane', tokens: ['brisbane'] },
      { name: 'Perth', tokens: ['perth'] },
      { name: 'Canberra', tokens: ['canberra'] },
      { name: 'Adelaide', tokens: ['adelaide'] },
    ],
  },
  {
    name: 'New Zealand',
    region: 'oceania',
    names: ['new zealand'],
    codes: ['nz'],
    cities: [
      { name: 'Auckland', tokens: ['auckland'] },
      { name: 'Wellington', tokens: ['wellington'] },
    ],
  },
  // ---- Middle East / North Africa ----
  {
    name: 'United Arab Emirates',
    region: 'mena',
    names: ['united arab emirates', 'uae'],
    codes: ['ae'],
    cities: [
      { name: 'Dubai', tokens: ['dubai'] },
      { name: 'Abu Dhabi', tokens: ['abu dhabi'] },
    ],
  },
  {
    name: 'Israel',
    region: 'mena',
    names: ['israel'],
    cities: [
      { name: 'Tel Aviv', tokens: ['tel aviv'] },
      { name: 'Jerusalem', tokens: ['jerusalem'] },
      { name: 'Haifa', tokens: ['haifa'] },
    ],
  },
  {
    name: 'Saudi Arabia',
    region: 'mena',
    names: ['saudi arabia', 'saudi'],
    codes: ['sa'],
    cities: [
      { name: 'Riyadh', tokens: ['riyadh'] },
      { name: 'Jeddah', tokens: ['jeddah'] },
    ],
  },
  {
    name: 'Turkey',
    region: 'mena',
    names: ['turkey', 'türkiye', 'turkiye'],
    codes: ['tr'],
    cities: [
      { name: 'Istanbul', tokens: ['istanbul'] },
      { name: 'Ankara', tokens: ['ankara'] },
    ],
  },
  {
    name: 'Qatar',
    region: 'mena',
    names: ['qatar'],
    cities: [{ name: 'Doha', tokens: ['doha'] }],
  },
  {
    name: 'Egypt',
    region: 'mena',
    names: ['egypt'],
    codes: ['eg'],
    cities: [{ name: 'Cairo', tokens: ['cairo'] }],
  },
  // ---- Africa ----
  {
    name: 'South Africa',
    region: 'africa',
    names: ['south africa'],
    codes: ['za'],
    cities: [
      { name: 'Johannesburg', tokens: ['johannesburg'] },
      { name: 'Cape Town', tokens: ['cape town'] },
      { name: 'Pretoria', tokens: ['pretoria'] },
      { name: 'Durban', tokens: ['durban'] },
    ],
  },
  {
    name: 'Nigeria',
    region: 'africa',
    names: ['nigeria'],
    codes: ['ng'],
    cities: [
      { name: 'Lagos', tokens: ['lagos'] },
      { name: 'Abuja', tokens: ['abuja'] },
    ],
  },
  {
    name: 'Kenya',
    region: 'africa',
    names: ['kenya'],
    codes: ['ke'],
    cities: [{ name: 'Nairobi', tokens: ['nairobi'] }],
  },
  {
    name: 'Morocco',
    region: 'africa',
    names: ['morocco'],
    cities: [
      { name: 'Casablanca', tokens: ['casablanca'] },
      { name: 'Rabat', tokens: ['rabat'] },
    ],
  },
  {
    name: 'Ghana',
    region: 'africa',
    names: ['ghana'],
    cities: [{ name: 'Accra', tokens: ['accra'] }],
  },
  // ---- Region-generic pseudo-countries (must stay last) ----
  {
    name: 'Europe',
    region: 'europe',
    names: ['europe', 'european', 'emea', 'eea', 'schengen'],
    codes: ['eu'],
  },
  { name: 'North America', region: 'namerica', names: ['north america'] },
  { name: 'Latin America', region: 'samerica', names: ['latin america', 'latam', 'south america'] },
  { name: 'Asia', region: 'asia', names: ['asia pacific', 'apac', 'asia'] },
  { name: 'Middle East', region: 'mena', names: ['middle east', 'mena', 'gcc'] },
  { name: 'Africa', region: 'africa', names: ['africa'] },
  { name: 'Oceania', region: 'oceania', names: ['oceania', 'anz'] },
];

const OTHER: LocClass = { country: '', city: '', region: 'other' };

/** Whole-word match: `tok` bounded by string edges or non-alphanumerics. */
function wordHit(haystack: string, tok: string): boolean {
  const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(haystack);
}

/**
 * A short code matches only when unambiguous: either it is an entire
 * comma/pipe/slash segment ("berlin, de") or an UPPERCASE standalone token in
 * the original text ("Austin, TX"). Lowercase English words never trigger it.
 */
function codeHit(raw: string, segments: string[], code: string): boolean {
  if (segments.includes(code)) return true;
  const esc = code.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z])${esc}([^A-Za-z]|$)`).test(raw);
}

function matchStateProvince(
  low: string,
  raw: string,
  segments: string[],
  table: RegionCode[],
  country: string,
  region: RegionKey,
): LocClass | null {
  for (const s of table) {
    if (wordHit(low, s.name) || codeHit(raw, segments, s.code)) {
      return { country, city: '', region };
    }
  }
  return null;
}

/**
 * Deterministic {country, city, region} for a free-text location. Unrecognized
 * input (empty, remote-only, unknown) returns an empty country -> Other bucket.
 */
export function classifyLoc(location: string | null): LocClass {
  const raw = (location ?? '').trim();
  if (!raw) return OTHER;
  const low = raw.toLowerCase();
  const segments = low
    .split(/[,/|·•;(){}[\]]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 1. City (most specific) - resolves both the country and the city.
  for (const def of COUNTRY_DEFS) {
    for (const city of def.cities ?? []) {
      if (city.tokens.some((tok) => wordHit(low, tok))) {
        return { country: def.name, city: city.name, region: def.region };
      }
    }
  }
  // 2. US state / Canadian province - catches "Austin, TX", "Remote - Ohio"
  //    even when the city itself is not enumerated. US wins over CA (see CA/CO).
  const us = matchStateProvince(low, raw, segments, US_STATES, USA, 'namerica');
  if (us) return us;
  const ca = matchStateProvince(low, raw, segments, CA_PROVINCES, CANADA, 'namerica');
  if (ca) return ca;
  // 3. Country name (whole word) or unambiguous code (segment / UPPERCASE token).
  for (const def of COUNTRY_DEFS) {
    if (
      def.names.some((n) => wordHit(low, n)) ||
      (def.codes ?? []).some((c) => codeHit(raw, segments, c))
    ) {
      return { country: def.name, city: '', region: def.region };
    }
  }
  return OTHER;
}

/** Stable selection key for a city ("Germany Berlin"). */
export function cityKey(country: string, city: string): string {
  return `${country} ${city}`;
}
