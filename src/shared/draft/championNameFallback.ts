import championSearchIndex from '../data/championSearchIndex.json'

/**
 * Riot-style champion names for ids used in role pools, public meta seeds, and search.
 * Used when the live Data Dragon map is not loaded yet, or a lookup is missing.
 */
export const BUNDLED_CHAMPION_NAMES: Readonly<Record<number, string>> = {
  2: 'Olaf',
  3: 'Galio',
  6: 'Urgot',
  7: 'LeBlanc',
  8: 'Vladimir',
  10: 'Kayle',
  11: 'Master Yi',
  12: 'Alistar',
  14: 'Sion',
  15: 'Sivir',
  16: 'Soraka',
  17: 'Teemo',
  18: 'Tristana',
  19: 'Warwick',
  20: 'Nunu & Willump',
  21: 'Miss Fortune',
  22: 'Ashe',
  23: 'Tryndamere',
  25: 'Morgana',
  26: 'Zilean',
  27: 'Singed',
  28: 'Evelynn',
  29: 'Twitch',
  30: 'Karthus',
  33: 'Rammus',
  34: 'Anivia',
  35: 'Shaco',
  36: 'Dr. Mundo',
  37: 'Sona',
  38: 'Kassadin',
  39: 'Irelia',
  40: 'Janna',
  41: 'Gangplank',
  43: 'Karma',
  44: 'Taric',
  48: 'Trundle',
  50: 'Swain',
  51: 'Caitlyn',
  53: 'Blitzcrank',
  54: 'Malphite',
  55: 'Katarina',
  56: 'Nocturne',
  57: 'Maokai',
  58: 'Renekton',
  59: 'Jarvan IV',
  60: 'Elise',
  61: 'Orianna',
  62: 'Wukong',
  63: 'Brand',
  64: 'Lee Sin',
  67: 'Vayne',
  69: 'Cassiopeia',
  74: 'Heimerdinger',
  76: 'Nidalee',
  77: 'Udyr',
  78: 'Poppy',
  80: 'Pantheon',
  79: 'Gragas',
  81: 'Ezreal',
  82: 'Mordekaiser',
  83: 'Yorick',
  84: 'Akali',
  85: 'Kennen',
  86: 'Garen',
  89: 'Leona',
  90: 'Malzahar',
  91: 'Talon',
  92: 'Riven',
  96: "Kog'Maw",
  98: 'Shen',
  101: 'Xerath',
  102: 'Shyvana',
  103: 'Ahri',
  104: 'Graves',
  105: 'Fizz',
  107: 'Rengar',
  110: 'Varus',
  111: 'Nautilus',
  112: 'Viktor',
  113: 'Sejuani',
  114: 'Fiora',
  115: 'Ziggs',
  117: 'Lulu',
  119: 'Draven',
  120: 'Hecarim',
  121: "Kha'Zix",
  122: 'Darius',
  127: 'Lissandra',
  131: 'Diana',
  133: 'Quinn',
  134: 'Syndra',
  136: 'Aurelion Sol',
  141: 'Kayn',
  142: 'Zoe',
  143: 'Zyra',
  145: "Kai'Sa",
  147: 'Seraphine',
  150: 'Gnar',
  154: 'Zac',
  157: 'Yasuo',
  161: "Vel'Koz",
  163: 'Taliyah',
  164: 'Camille',
  200: "Bel'Veth",
  201: 'Braum',
  202: 'Jhin',
  203: 'Kindred',
  221: 'Zeri',
  222: 'Jinx',
  223: 'Tahm Kench',
  233: 'Briar',
  234: 'Viego',
  236: 'Lucian',
  238: 'Zed',
  240: 'Kled',
  245: 'Ekko',
  254: 'Vi',
  266: 'Aatrox',
  267: 'Nami',
  268: 'Azir',
  360: 'Samira',
  412: 'Thresh',
  420: 'Illaoi',
  421: "Rek'Sai",
  429: 'Kalista',
  432: 'Bard',
  517: 'Sylas',
  498: 'Xayah',
  516: 'Ornn',
  523: 'Aphelios',
  526: 'Rell',
  555: 'Pyke',
  711: 'Vex',
  777: 'Yone',
  799: 'Ambessa',
  876: 'Lillia',
  887: 'Gwen',
  875: 'Sett',
  895: 'Nilah',
  897: "K'Sante",
  902: 'Milio',
  910: 'Hwei',
  950: 'Naafiri'
}

type ChampionSearchIndexRow = {
  id?: unknown
  name?: unknown
}

function indexedChampionNames(): ReadonlyMap<number, string> {
  const rawRows = (championSearchIndex as { champions?: ChampionSearchIndexRow[] }).champions ?? []
  const rows = rawRows
    .map((row): [number, string] | null => {
      if (typeof row.id !== 'number' || typeof row.name !== 'string' || !row.name.trim()) {
        return null
      }
      return [row.id, row.name]
    })
    .filter((row): row is [number, string] => row != null)
  return new Map(rows)
}

const CHAMPION_SEARCH_INDEX_NAMES = indexedChampionNames()

export function resolveChampionName(
  championId: number,
  idToName: ReadonlyMap<number, string> | null
): string {
  const live = idToName?.get(championId)
  if (live) {
    return live
  }
  return CHAMPION_SEARCH_INDEX_NAMES.get(championId) ?? BUNDLED_CHAMPION_NAMES[championId] ?? `Champion ${championId}`
}
