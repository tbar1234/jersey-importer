/**
 * importer/translate.js
 * ─────────────────────────────────────────────────────────────────────────
 * Converts raw Chinese Yupoo album titles into clean English jersey titles,
 * and derives structured filter metadata (team, season, kit type, size
 * range, category) from the same string.
 *
 * Yupoo titles in this catalog follow a fairly consistent pattern, e.g.:
 *   "26-27波尔图主S-4XL"        -> "26-27 Porto Home (S-4XL)"
 *   "26-27巴萨二客紫色球员版"     -> "26-27 Barcelona Away (Purple) – Player Version"
 *   "26国家队拜仁慕尼黑客场"      -> "26 Bayern Munich Away"
 *
 * Because this is a long-tail, ever-growing catalog, we use a two-stage
 * approach:
 *   1. DICTIONARY — a hand-maintained map of Chinese team names / kit
 *      keywords to English, covering the clubs & countries already seen
 *      in the catalog. Easy to extend as new teams appear.
 *   2. PATTERN PARSER — strips season codes, kit-type keywords, and size
 *      ranges out of the raw string using regex, translating each
 *      recognized fragment and reassembling a clean English title.
 *
 * Anything not found in the dictionary is left in its original (Chinese)
 * form inside the title, wrapped so it's still visually obvious in the
 * admin/import logs that it needs a manual translation added below.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ── Team / country dictionary (Chinese fragment -> English name) ─────────
// Longer/more specific keys are matched first to avoid partial collisions
// (e.g. match "拜仁慕尼黑" before a hypothetical shorter "拜仁").
const TEAM_DICTIONARY = [
  // Clubs — Europe
  ['巴塞罗那', 'Barcelona'], ['巴萨', 'Barcelona'],
  ['切尔西', 'Chelsea'],
  ['皇家马德里', 'Real Madrid'], ['皇马', 'Real Madrid'],
  ['拜仁慕尼黑', 'Bayern Munich'], ['拜仁', 'Bayern Munich'],
  ['多特蒙德', 'Borussia Dortmund'], ['多特', 'Borussia Dortmund'],
  ['巴黎圣日耳曼', 'PSG'], ['巴黎', 'PSG'],
  ['阿贾克斯', 'Ajax'],
  ['利物浦', 'Liverpool'],
  ['阿森纳', 'Arsenal'],
  ['曼联', 'Manchester United'],
  ['曼城', 'Manchester City'],
  ['国际米兰', 'Inter Milan'], ['国米', 'Inter Milan'],
  ['ac米兰', 'AC Milan'], ['AC米兰', 'AC Milan'], ['米兰', 'AC Milan'], ['AC', 'AC Milan'],
  ['尤文图斯', 'Juventus'], ['尤文', 'Juventus'],
  ['本菲卡', 'Benfica'],
  ['波尔图', 'Porto'],
  ['马赛', 'Marseille'],
  ['毕尔巴鄂竞技', 'Athletic Bilbao'], ['毕尔巴鄂', 'Athletic Bilbao'],
  ['巴伦西亚', 'Valencia'], ['瓦伦西亚', 'Valencia'],
  ['巴列卡诺', 'Rayo Vallecano'],
  ['科莫', 'Como'],
  ['考文垂', 'Coventry City'],
  ['阿尔纳斯尔', 'Al-Nassr'], ['纳斯尔', 'Al-Nassr'],
  ['马德里竞技', 'Atlético Madrid'], ['马竞', 'Atlético Madrid'],
  ['塞维利亚', 'Sevilla'],
  ['博德闪耀', 'Bodø/Glimt'],
  ['纽卡斯尔', 'Newcastle'], ['纽卡斯', 'Newcastle'], ['纽卡', 'Newcastle'],
  ['皇家贝蒂斯', 'Real Betis'], ['贝蒂斯', 'Real Betis'],
  ['凯尔特人', 'Celtic'],
  ['阿斯顿维拉', 'Aston Villa'],
  ['萨尔茨堡红牛', 'Red Bull Salzburg'], ['奥地利红牛', 'Red Bull Salzburg'],
  ['莱比锡红牛', 'RB Leipzig'],
  ['科隆', 'FC Köln'],
  ['不来梅', 'Werder Bremen'],
  ['热刺', 'Tottenham Hotspur'],
['西汉姆', 'West Ham United'],
['富勒姆', 'Fulham'],
['埃弗顿', 'Everton'],
['狼队', 'Wolverhampton Wanderers'],
['伯恩茅斯', 'Bournemouth'],
['布莱顿', 'Brighton'],
['水晶宫', 'Crystal Palace'],
['诺丁汉', 'Nottingham Forest'],
['利兹联', 'Leeds United'],
['普利茅斯', 'Plymouth Argyle'],
['考文垂', 'Coventry City'],
['热刺', 'Tottenham'],
['托特纳姆', 'Tottenham'],
['芝华士', 'Chivas'],

['巴黎', 'PSG'],

['巴勒斯坦人', 'Palestine'],

['布拉甘蒂诺红牛', 'Red Bull Bragantino'],

['米内罗', 'Atlético Mineiro'],

['洛杉矶', 'LAFC'],
['那不勒斯', 'Napoli'],

['罗马', 'Roma'],

['费耶诺德', 'Feyenoord'],
['费耶诺得', 'Feyenoord'],

['南特', 'Nantes'],

['奥林亚科斯', 'Olympiacos'],
['奥林匹亚科斯', 'Olympiacos'],

['雅典', 'AEK Athens'],

['威尼斯', 'Venezia'],

['矿工', 'Shakhtar Donetsk'],

['波西米亚人', 'Bohemians'],

['埃什托里尔', 'Estoril'],

['桑托斯', 'Santos'],

['国民竞技', 'Atlético Nacional'],

['蒙特雷', 'Monterrey'],

['开罗国民', 'Al Ahly'],

['新月', 'Al Hilal'],

['科洛', 'Colo-Colo'],

['国民', 'Nacional'],

['云达不莱梅', 'Werder Bremen'],
['罗马', 'AS Roma'],
['那不勒斯', 'Napoli'],
['亚特兰大', 'Atalanta'],
['威尼斯', 'Venezia'],
['摩纳哥', 'Monaco'],
['里昂', 'Lyon'],
['里尔', 'Lille'],
['雷恩', 'Rennes'],
['南特', 'Nantes'],

['勒沃库森', 'Bayer Leverkusen'],
['沙尔克', 'Schalke 04'],
['纽伦堡', 'Nürnberg'],

['费耶诺德', 'Feyenoord'],
['哥本哈根', 'Copenhagen'],
['流浪者', 'Rangers'],
['凯尔特人', 'Celtic'],

['加拉塔萨雷', 'Galatasaray'],
['奥林匹亚科斯', 'Olympiacos'],
['波西米亚人', 'Bohemians'],
['波西米亚', 'Bohemians'],
['AC', 'AC Milan'],
['国民竞技', 'Atlético Nacional'],
['芝华士', 'Chivas'],
['赫罗纳', 'Girona'],
['塞尔塔', 'Celta Vigo'],
['奥维耶多', 'Real Oviedo'],
['利雅得胜利', 'Al-Nassr'],
['利雅得新月', 'Al-Hilal'],
['新月', 'Al-Hilal'],
['利雅得', 'Al-Nassr'], // generic supplier naming

['吉达联合', 'Al-Ittihad'],
['吉达国民', 'Al-Ahli'],
['国民', 'Al-Ahli'],

['开罗国民', 'Al Ahly'],
['里斯本', 'Sporting CP'],
['本菲卡', 'Benfica'],
['波尔图', 'Porto'],
['埃什托里尔', 'Estoril'],

  // Clubs — Americas
  ['弗拉门戈', 'Flamengo'],
  ['河床', 'River Plate'],
  ['科林蒂安', 'Corinthians'],
  ['圣保罗', 'São Paulo FC'],
  ['巴伊亚', 'Bahia'],
  ['美洲狮', 'Pumas UNAM'],
  ['美洲队', 'Club América'], ['美洲', 'Club América'],
  ['老虎队', 'Tigres UANL'], ['老虎', 'Tigres UANL'],
  ['瓜达拉哈拉', 'Chivas'], ['芝华士', 'Chivas'],
  ['迈阿密国际', 'Inter Miami'], ['国际迈阿密', 'Inter Miami'], ['迈阿密', 'Inter Miami'],
  ['米内罗', 'Atlético Mineiro'],
  ['帕尔梅拉斯', 'Palmeiras'],
  ['蓝十字', 'Cruz Azul'],
  ['洛杉矶', 'LAFC'],
  ['布拉甘红牛', 'Red Bull Bragantino'], ['布拉甘蒂诺', 'Red Bull Bragantino'],
  ['达伽马', 'Vasco da Gama'],
  ['克鲁塞罗', 'Cruzeiro'],
  ['蒙特雷', 'Monterrey'],
['哥伦布机员', 'Columbus Crew'],
['纽约红牛', 'New York Red Bulls'],
['纽约城', 'New York City FC'],
['银河', 'LA Galaxy'],
['奥兰多', 'Orlando City'],
['夏洛特', 'Charlotte FC'],
['伐木者', 'Portland Timbers'],
['桑托斯', 'Santos'],
['格雷米奥', 'Grêmio'],
['弗鲁米嫩塞', 'Fluminense'],
['巴西国际', 'Internacional'],
['博卡', 'Boca Juniors'],
['国民竞技', 'Atlético Nacional'],
['百万富翁', 'Millonarios'],
['累西菲', 'Sport Recife'],

  // National teams
  ['葡萄牙', 'Portugal'],
  ['库拉索', 'Curaçao'],
  ['伊拉克', 'Iraq'],
  ['阿根廷', 'Argentina'],
  ['荷兰', 'Netherlands'],
  ['墨西哥', 'Mexico'],
  ['西班牙', 'Spain'],
  ['英格兰', 'England'],
  ['塞内加尔', 'Senegal'],
  ['刚果', 'Congo'],
  ['危地马拉', 'Guatemala'],
  ['尼日利亚', 'Nigeria'],
  ['南非', 'South Africa'],
  ['埃及', 'Egypt'],
  ['科特迪瓦', 'Ivory Coast'],
  ['卡塔尔', 'Qatar'],
  ['沙特阿拉伯', 'Saudi Arabia'], ['沙特', 'Saudi Arabia'],
  ['韩国', 'South Korea'],
  ['土耳其', 'Turkey'],
  ['克罗地亚', 'Croatia'],
  ['法国', 'France'],
  ['挪威', 'Norway'],
  ['德国', 'Germany'],
  ['巴西', 'Brazil'],
  ['智利', 'Chile'],
  ['新西兰', 'New Zealand'],
  ['巴拿马', 'Panama'],
  ['美国', 'USA'],
  ['意大利', 'Italy'],
  ['加纳', 'Ghana'],
  ['巴勒斯坦', 'Palestine'],
  ['摩洛哥', 'Morocco'],
  ['阿尔及利亚', 'Algeria'],
  ['比利时', 'Belgium'],
['瑞士', 'Switzerland'],
['苏格兰', 'Scotland'],
['威尔士', 'Wales'],
['爱尔兰', 'Ireland'],
['北爱尔兰', 'Northern Ireland'],
['瑞典', 'Sweden'],
['奥地利', 'Austria'],
['阿尔巴尼亚', 'Albania'],
['加拿大', 'Canada'],
['哥伦比亚', 'Colombia'],
['乌拉圭', 'Uruguay'],
['委内瑞拉', 'Venezuela'],
['厄瓜多尔', 'Ecuador'],
['哥斯达黎加', 'Costa Rica'],
['巴拉圭', 'Paraguay'],
['牙买加', 'Jamaica'],
['喀麦隆', 'Cameroon'],
['马里', 'Mali'],
['几内亚', 'Guinea'],
['突尼斯', 'Tunisia'],
['日本', 'Japan'],
['科特瓦迪', 'Ivory Coast'],
['象牙海岸', 'Ivory Coast'],
  ['约旦', 'Jordan'],

['日本', 'Japan'],

['牙买加', 'Jamaica'],

['北爱尔兰', 'Northern Ireland'],

['马里', 'Mali'],

['哥伦比亚', 'Colombia'],

['突尼斯', 'Tunisia'],

['澳大利亚', 'Australia'],
];

// ── Kit-type keyword dictionary ───────────────────────────────────────────
// IMPORTANT: longer/more specific phrases must come before their shorter
// substrings (e.g. "二客" before "客", "主场" before "主") since
// applyDictionary() does simple ordered substring replacement.
const KIT_TYPE_DICTIONARY = [
  ['二客', 'Second Away'],
  ['三客', 'Third'],
  ['主场', 'Home'], ['主', 'Home'],
  ['客场', 'Away'], ['客', 'Away'],
  ['门将', 'Goalkeeper'], ['守门员', 'Goalkeeper'],
  ['赛前服', 'Pre-Match'],
  ['训练服', 'Training Kit'], ['训练', 'Training'],
  ['球员版', 'Player Version'],
  ['球迷版', 'Fan Version'], ['球迷', 'Fan Version'],
  ['特别版', 'Special Edition'],
  ['限量版', 'Limited Edition'],
  ['纪念版', 'Anniversary Edition'], ['周年', 'Anniversary Edition'], ['纪念', 'Anniversary Edition'],
  ['复古', 'Retro'],
  ['长袖', 'Long Sleeve'],
  ['电竞版', 'Esports Edition'],
['杯赛版', 'Cup Edition'],
['联名版', 'Collaboration Edition'],
['冠军版', 'Champions Edition'],
['啤酒节', 'Oktoberfest Edition'],
['万圣节', 'Halloween Edition'],
['纪念版', 'Anniversary Edition'],
['训练服', 'Training Kit'],
['热身', 'Warm-Up'],
['联赛版', 'League Edition'],
  ['短袖', 'Short Sleeve'],
  ['polo衫', 'Polo'], ['POLO', 'Polo'],
  ['女装', 'Women'], ['女神版', "Women's Edition"],
  ['龙年', 'Dragon Year'],
  ['Y3', 'Y-3'],
  ['三叶草', 'Trefoil'], // adidas Originals design line, not a team — multiple clubs use it
  ['国家队', ''], // "national team" — informational only, category is derived separately
];

const COLOR_DICTIONARY = [
  ['紫色', 'Purple'], ['黑色', 'Black'], ['白色', 'White'],
  ['红色', 'Red'], ['蓝色', 'Blue'], ['黄色', 'Yellow'],
  ['绿色', 'Green'], ['金色', 'Gold'], ['粉色', 'Pink'],
];

/**
 * Translate Chinese substrings within a title using a dictionary,
 * returning { translated: string, matchedTerms: string[] }.
 */
function applyDictionary(str, dictionary) {
  let result = str;
  const matched = [];
  for (const [zh, en] of dictionary) {
    if (result.includes(zh)) {
      if (en) matched.push(en);
      result = result.split(zh).join(en ? ` ${en} ` : ' ');
    }
  }
  return { result, matched };
}

/**
 * Extract a season code like "26-27", "25-26", or a bare "26" from the title.
 */
function extractSeason(title) {
  const range = title.match(/\b(\d{2})-(\d{2})\b/);
  if (range) return `${range[1]}-${range[2]}`;
  const single = title.match(/\b(\d{2})\b/);
  return single ? single[1] : null;
}

/**
 * Extract a size range like "S-4XL", "S-2XL", "S-3XL" from the title.
 */
function extractSizeRange(title) {
  const m = title.match(/\bS-\d?XL\b/i);
  return m ? m[0].toUpperCase() : null;
}

/**
 * Main translation function.
 * Input:  raw Chinese (or mixed) Yupoo album title
 * Output: {
 *   titleEn:    clean English display title
 *   team:       detected team/country name (or null)
 *   season:     "26-27" etc (or null)
 *   sizeRange:  "S-4XL" etc (or null)
 *   kitTypes:   array of detected kit-type tags, e.g. ["Home"]
 *   colors:     array of detected color words, e.g. ["Purple"]
 *   needsReview:boolean — true if no team was matched (manual translation
 *               may be required)
 * }
 */
function translateTitle(rawTitle) {
  let working = rawTitle.trim();

  const season = extractSeason(working);
  const sizeRange = extractSizeRange(working);

  // Strip season + size tokens out before matching team/kit-type words so
  // they don't interfere with substring matches.
  if (season) working = working.replace(season, ' ');
  if (sizeRange) working = working.replace(new RegExp(sizeRange, 'i'), ' ');

  const teamMatch = applyDictionary(working, TEAM_DICTIONARY);
  working = teamMatch.result;

  const kitMatch = applyDictionary(working, KIT_TYPE_DICTIONARY);
  working = kitMatch.result;

  const colorMatch = applyDictionary(working, COLOR_DICTIONARY);
  working = colorMatch.result;

  const team = teamMatch.matched[0] || null;
  const kitTypes = [...new Set(kitMatch.matched)];
  const colors = [...new Set(colorMatch.matched)];

  // Remaining un-translated Chinese characters (if any) — surfaced so the
  // importer log can flag rows that need a manual dictionary entry.
  const leftoverChinese = (working.match(/[\u4e00-\u9fff]+/g) || []).join(' ');

  // Build a cleaner English title
  const parts = [];

  if (team) {
    parts.push(team);
  }

  if (season) {
    if (/^\d{2}$/.test(season)) {
      parts.push(`20${season}`);
    } else {
      parts.push(season);
    }
  }

  if (kitTypes.length) {
    parts.push(kitTypes.join(' '));
  }

  if (colors.length) {
    parts.push(colors.join('/'));
  }

  if (sizeRange) {
    parts.push(`(${sizeRange})`);
  }

  let titleEn = parts.join(' ').replace(/\s+/g, ' ').trim();

  if (!titleEn && team) {
    titleEn = `${team} Jersey`;
  }

  // Final fallback: scraped/id is not in scope here, so fall back to the
  // original raw title rather than referencing an undefined variable.
  if (!titleEn) {
    titleEn = rawTitle;
  }

  return {
    titleEn,
    team,
    season,
    sizeRange,
    kitTypes,
    colors,
    needsReview: !team || Boolean(leftoverChinese),
    leftoverChinese: leftoverChinese || null,
  };
}

/**
 * Derive a normalized "category" tag (club vs national team) and a
 * coarse "region" tag, used for the website's filter pills.
 * This is intentionally simple/heuristic — extend REGION_MAP as needed.
 */
const NATIONAL_TEAMS = new Set([
  'Portugal', 'Curaçao', 'Iraq', 'Argentina', 'Netherlands', 'Mexico',
  'Spain', 'England', 'Senegal', 'Congo', 'Guatemala', 'Nigeria',
  'South Africa', 'Egypt', 'Ivory Coast', 'Qatar', 'Saudi Arabia',
  'South Korea', 'Turkey', 'Croatia', 'France', 'Norway', 'Germany',
  'Brazil', 'Chile', 'New Zealand', 'Panama', 'USA',
  'Italy', 'Ghana', 'Palestine', 'Algeria', 'Morocco',
]);

const REGION_MAP = {
  // Europe
  Barcelona: 'europe', Chelsea: 'europe', 'Real Madrid': 'europe',
  'Bayern Munich': 'europe', 'Borussia Dortmund': 'europe', PSG: 'europe',
  Ajax: 'europe', Liverpool: 'europe', Arsenal: 'europe',
  'Manchester United': 'europe', 'Manchester City': 'europe',
  'Inter Milan': 'europe', 'AC Milan': 'europe', Juventus: 'europe',
  Benfica: 'europe', Porto: 'europe', Marseille: 'europe',
  'Athletic Bilbao': 'europe', Valencia: 'europe', 'Rayo Vallecano': 'europe',
  Como: 'europe', 'Coventry City': 'europe', Portugal: 'europe',
  Netherlands: 'europe', Spain: 'europe', England: 'europe',
  Turkey: 'europe', Croatia: 'europe', France: 'europe', Norway: 'europe',
  Germany: 'europe', Italy: 'europe', 'Atlético Madrid': 'europe',
  Newcastle: 'europe', 'Real Betis': 'europe', Celtic: 'europe',
  'Aston Villa': 'europe', 'Red Bull Salzburg': 'europe',
  'RB Leipzig': 'europe', 'FC Köln': 'europe', 'Werder Bremen': 'europe',
  'Bodø/Glimt': 'europe', Sevilla: 'europe',
  // South America
  Flamengo: 'southamerica', 'River Plate': 'southamerica',
  Corinthians: 'southamerica', 'São Paulo FC': 'southamerica',
  Bahia: 'southamerica', Argentina: 'southamerica', Brazil: 'southamerica',
  Chile: 'southamerica', 'Atlético Mineiro': 'southamerica', Palmeiras: 'southamerica',
  'Red Bull Bragantino': 'southamerica', 'Vasco da Gama': 'southamerica', Cruzeiro: 'southamerica',
  // North / Central America
  'Club América': 'northamerica', 'Tigres UANL': 'northamerica',
  Chivas: 'northamerica', Curaçao: 'northamerica', Mexico: 'northamerica',
  Guatemala: 'northamerica', Panama: 'northamerica', USA: 'northamerica',
  'Inter Miami': 'northamerica', 'Pumas UNAM': 'northamerica',
  'Cruz Azul': 'northamerica', LAFC: 'northamerica',
  // Africa
  Senegal: 'africa', Congo: 'africa', Nigeria: 'africa',
  'South Africa': 'africa', Egypt: 'africa', 'Ivory Coast': 'africa',
  Ghana: 'africa', Algeria: 'africa', Morocco: 'africa',
  // Asia / Middle East
  'Al-Nassr': 'asia', Iraq: 'asia', Qatar: 'asia', 'Saudi Arabia': 'asia',
  'South Korea': 'asia', Palestine: 'asia',
  // Oceania
  'New Zealand': 'oceania',
};

function deriveCategory(team) {
  if (!team) return 'club';
  return NATIONAL_TEAMS.has(team) ? 'national' : 'club';
}

function deriveRegion(team) {
  if (!team) return 'europe';
  return REGION_MAP[team] || 'europe';
}

/**
 * Map detected kit-type words to the single-tag vocabulary used by the
 * website's filter pills: home | away | third | player | training |
 * special | gk
 */
function deriveTypeTag(kitTypes) {
  const joined = kitTypes.join(' ').toLowerCase();
  if (joined.includes('goalkeeper')) return 'gk';
  if (joined.includes('pre-match')) return 'prematch';
  if (joined.includes('player version')) return 'player';
  if (joined.includes('training')) return 'training';
  if (joined.includes('special') || joined.includes('anniversary') || joined.includes('retro')) return 'special';
  if (joined.includes('second away') || joined.includes('third')) return 'third';
  if (joined.includes('away')) return 'away';
  if (joined.includes('home')) return 'home';
  return 'home'; // sensible default
}

module.exports = {
  translateTitle,
  deriveCategory,
  deriveRegion,
  deriveTypeTag,
  TEAM_DICTIONARY,
  KIT_TYPE_DICTIONARY,
  COLOR_DICTIONARY,
};