// [lng, lat] for known BESS sites, keyed by site ID: the nationalGridBmUnit
// minus its trailing "-N" (e.g. "KILSB-3" → "KILSB"). NG IDs carry no E_/T_ prefix.
// Each site is identified from its Elexon bmUnitName or lead party; coordinates
// are town-level approximations, not surveyed site locations.
export const SITE_COORDS: Record<string, [number, number]> = {
  // Scotland
  "BLHLB":  [-2.930, 57.530],  // Blackhillock (Zenobe), near Keith, Moray
  "KILSB":  [-4.500, 55.590],  // Kilmarnock South (Zenobe), Ayrshire
  "COALB":  [-3.870, 55.580],  // Coalburn (Alcemi), S. Lanarkshire
  "WISHB":  [-3.920, 55.770],  // Wishaw (Zenobe), N. Lanarkshire
  "NLSTB":  [-4.430, 55.780],  // Neilston, E. Renfrewshire
  "WHLWB":  [-4.300, 55.680],  // Whitelee Battery, E. Renfrewshire
  "CATHB":  [-4.200, 55.800],  // Cathkin, Glasgow
  "DALMB":  [-4.210, 55.840],  // Dalmarnock, Glasgow
  "ERSKB":  [-4.450, 55.910],  // Erskine, Renfrewshire
  "BROXB":  [-3.470, 55.930],  // Broxburn, W. Lothian
  "LITRB":  [-3.310, 56.100],  // Little Raith, Fife
  "JAMBB":  [-3.330, 56.340],  // Jamesfield, Perth & Kinross
  "CUPAB":  [-3.270, 56.550],  // Coupar Angus, Perth & Kinross
  "ARBRB":  [-2.580, 56.560],  // Arbroath, Angus
  "DYCEB":  [-2.190, 57.200],  // Dyce, Aberdeen
  "KTHRS":  [-2.950, 57.540],  // Keith Storage (Statkraft), Moray
  "COYLB":  [-4.520, 55.440],  // Coylton Greener Grid Park, Ayrshire
  // North of England
  "FBPG02": [-1.371, 54.813],  // Hawthorn Pit, Co. Durham
  "POTES":  [-1.440, 55.000],  // Port of Tyne, Tyneside
  "PILLB":  [-0.408, 53.783],  // Pillswood, E. Yorkshire
  "FERRB":  [-1.280, 53.710],  // Ferrybridge (SSE), W. Yorkshire
  "MNFRB":  [-1.230, 53.760],  // Monk Fryston (SSE), N. Yorkshire
  "MKFRB":  [-1.230, 53.760],  // Monk Fryston, N. Yorkshire
  "WHTBB":  [-2.450, 53.750],  // Whitebirk, Blackburn
  "SKELB":  [-2.770, 53.550],  // Skelmersdale, Lancashire
  "OLDHB":  [-2.120, 53.540],  // Oldham, Gtr Manchester
  "BREDB":  [-2.110, 53.420],  // Bredbury (Pivot Power), Stockport
  "WBURB":  [-0.810, 53.360],  // West Burton, Nottinghamshire
  "LIONB":  [-1.100, 54.580],  // Wilton BESS (Sembcorp), Teesside
  "LionD":  [-1.100, 54.580],  // Wilton BESS (Sembcorp), Teesside
  "CAPNB":  [-2.950, 53.260],  // Capenhurst, Cheshire
  "PINFB":  [-2.950, 53.260],  // Zenobe Capenhurst, Cheshire
  "WTGTB":  [-2.560, 53.210],  // Whitegate, Cheshire
  // Midlands & East
  "BUSTB":  [-1.980, 52.540],  // Bustleholme (Pivot Power), W. Midlands
  "WOLVB":  [-2.127, 52.579],  // Wolverhampton West
  "COVNB":  [-1.510, 52.410],  // Coventry (Pivot Power)
  "OCHLB":  [-2.040, 52.540],  // Ocker Hill, Tipton
  "ENDRB":  [-1.210, 52.590],  // Enderby, Leicestershire
  "BURWB":  [ 0.330, 52.280],  // Burwell, Cambridgeshire
  "SUNDB":  [-0.470, 51.930],  // Sundon (Pivot Power), Bedfordshire
  "TEBWB":  [-0.570, 51.940],  // Tebworth, Bedfordshire
  "COWB":   [-1.200, 51.730],  // Cowley (Pivot Power), Oxford
  // South East
  "THURB":  [ 0.330, 51.480],  // Thurrock Storage, Essex
  "BLPFB":  [ 0.360, 51.550],  // Bulphan Fen, Essex
  "DOLLB":  [ 0.530, 51.600],  // Dollymans, Essex
  "BRETB":  [ 0.300, 51.620],  // Brentwood, Essex
  "KEMB":   [ 0.740, 51.360],  // Kemsley (Pivot Power), Kent
  "RICHB":  [ 1.340, 51.310],  // Richborough Energy Park, Kent
  "FARNB":  [-0.800, 51.210],  // Farnham, Surrey
  "NURSB":  [-1.470, 50.950],  // Nursling, Hampshire
  // South West & Wales
  "IRNAB":  [-2.470, 51.560],  // Iron Acton, S. Gloucestershire
  "LARKB":  [-2.470, 51.560],  // Larks Green, by Iron Acton
  "BERKB":  [-2.460, 51.690],  // Berkeley, Gloucestershire
  "BHOLB":  [-2.006, 50.719],  // Holes Bay, Poole
  "NTAWB":  [-3.900, 50.800],  // North Tawton, Devon
  "INDQB":  [-4.920, 50.400],  // Indian Queens (Pivot Power), Cornwall
  "USKMB":  [-2.970, 51.550],  // Uskmouth, Newport
  "NEWPB":  [-2.990, 51.580],  // Newport BESS
  "PNYCB":  [-3.620, 51.700],  // Pen y Cymoedd, Neath Port Talbot
};

// GSP group code → canonical name. The reference data spells names several
// ways ("Eastern" / "Eastern GSP Group", "Northern" / "NORTHERN" …), so the code
// is the reliable key. Transmission-connected units usually have no GSP group.
export const GSP_NAMES: Record<string, string> = {
  "_A": "Eastern",
  "_B": "East Midlands",
  "_C": "London",
  "_D": "Merseyside & North Wales",
  "_E": "Midlands",
  "_F": "Northern",
  "_G": "North Western",
  "_H": "Southern",
  "_J": "South Eastern",
  "_K": "South Wales",
  "_L": "South Western",
  "_M": "Yorkshire",
  "_N": "South Scotland",
  "_P": "North Scotland",
};

// Approximate centroid [lng, lat] of each GSP group area.
export const GSP_CENTROIDS: Record<string, [number, number]> = {
  "_A": [ 0.900,  52.300],  // Eastern
  "_B": [-1.000,  52.900],  // East Midlands
  "_C": [-0.100,  51.500],  // London
  "_D": [-3.300,  53.200],  // Merseyside & North Wales
  "_E": [-2.100,  52.500],  // Midlands (West Midlands)
  "_F": [-1.700,  54.900],  // Northern (North East England)
  "_G": [-2.600,  53.700],  // North Western
  "_H": [-1.300,  51.000],  // Southern
  "_J": [ 0.600,  51.200],  // South Eastern
  "_K": [-3.500,  51.700],  // South Wales
  "_L": [-3.500,  50.700],  // South Western
  "_M": [-1.300,  53.800],  // Yorkshire
  "_N": [-3.800,  55.600],  // South Scotland
  "_P": [-4.200,  57.300],  // North Scotland
};

// [lng, lat] for a BMU: exact site match, else its GSP group centroid, else
// null — units with no known location are left off the map rather than
// stacked at an arbitrary point.
export function getCoordinates(
  nationalGridBmUnit: string,
  gspGroupId: string | null | undefined,
): [number, number] | null {
  const siteId = nationalGridBmUnit.replace(/-\d+$/, "");
  if (SITE_COORDS[siteId]) return SITE_COORDS[siteId];
  if (gspGroupId && GSP_CENTROIDS[gspGroupId]) return GSP_CENTROIDS[gspGroupId];
  return null;
}
