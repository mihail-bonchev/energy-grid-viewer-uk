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
  // Midlands & East
  "BUSTB":  [-1.980, 52.540],  // Bustleholme (Pivot Power), W. Midlands
  "WOLVB":  [-2.127, 52.579],  // Wolverhampton West
  "COVNB":  [-1.510, 52.410],  // Coventry (Pivot Power)
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
  "BERKB":  [-2.460, 51.690],  // Berkeley, Gloucestershire
  "BHOLB":  [-2.006, 50.719],  // Holes Bay, Poole
  "NTAWB":  [-3.900, 50.800],  // North Tawton, Devon
  "INDQB":  [-4.920, 50.400],  // Indian Queens (Pivot Power), Cornwall
  "USKMB":  [-2.970, 51.550],  // Uskmouth, Newport
  "NEWPB":  [-2.990, 51.580],  // Newport BESS
  "PNYCB":  [-3.620, 51.700],  // Pen y Cymoedd, Neath Port Talbot
};

// Approximate centroids for Elexon GSP group codes (fallback for unrecognised sites).
// GSP groups cover distinct transmission regions in GB.
export const GSP_CENTROIDS: Record<string, [number, number]> = {
  "_A": [ 0.900,  52.300],  // Eastern
  "_B": [-1.200,  52.800],  // East Midlands
  "_C": [-0.100,  51.500],  // London
  "_D": [-2.000,  52.400],  // Midlands
  "_E": [-1.600,  54.800],  // North East England
  "_F": [-2.500,  53.800],  // North West England
  "_G": [-3.800,  55.500],  // Southern Scotland
  "_H": [-4.500,  57.200],  // Northern Scotland
  "_J": [ 0.500,  51.100],  // South East England
  "_K": [-1.300,  50.900],  // Southern England
  "_L": [-2.500,  51.000],  // South Western England
  "_M": [-1.500,  53.700],  // Yorkshire
  "_N": [-3.500,  51.600],  // South Wales
  "_P": [-3.800,  53.100],  // North Wales + Merseyside
  // Human-readable fallbacks (in case API returns full names)
  "Eastern":               [ 0.900,  52.300],
  "East Midlands":         [-1.200,  52.800],
  "London":                [-0.100,  51.500],
  "Midlands":              [-2.000,  52.400],
  "North East":            [-1.600,  54.800],
  "North West":            [-2.500,  53.800],
  "Southern Scotland":     [-3.800,  55.500],
  "Northern Scotland":     [-4.500,  57.200],
  "South East":            [ 0.500,  51.100],
  "Southern":              [-1.300,  50.900],
  "South Western":         [-2.500,  51.000],
  "South West":            [-2.500,  51.000],
  "Yorkshire":             [-1.500,  53.700],
  "South Wales":           [-3.500,  51.600],
  "North Wales":           [-3.800,  53.100],
};

// Given a nationalGridBmUnit like "KILSB-3", return [lng, lat] if known.
// Falls back to GSP group centroid, then geographic centre of GB.
export function getCoordinates(
  nationalGridBmUnit: string,
  gspGroup: string,
): [number, number] {
  // Try exact site match by stripping the trailing "-N" unit number
  const prefix = nationalGridBmUnit.replace(/-\d+$/, "");
  if (SITE_COORDS[prefix]) return SITE_COORDS[prefix];

  // Try GSP group centroid
  if (GSP_CENTROIDS[gspGroup]) return GSP_CENTROIDS[gspGroup];

  // Final fallback: geographic centre of Great Britain
  return [-1.5, 53.0];
}
