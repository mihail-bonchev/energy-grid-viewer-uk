// Exact [lng, lat] for known grid-scale BESS sites, keyed by the
// nationalGridBmUnit prefix (everything before the last "-N" unit number).
// Coordinates are approximate centroid of each physical site.
export const SITE_COORDS: Record<string, [number, number]> = {
  // From KNOWN_BESS in units-route.ts
  "E_MINETY":  [-1.968,  51.634],  // Minety, Wiltshire
  "E_PILGR":   [-0.408,  53.783],  // Pillswood, E. Yorkshire
  "E_STAPL":   [-1.083,  51.204],  // Staple Cross, Hampshire
  "E_PYLNW":   [-2.580,  51.140],  // Pylle, Somerset
  "E_COWES":   [-1.300,  50.759],  // Cowes, Isle of Wight
  "E_BAGE1":   [-3.811,  51.637],  // Baglan Bay, South Wales
  "E_GOWGE":   [-1.537,  53.427],  // Gowge, S. Yorkshire
  "T_BTUFW":   [-3.175,  53.488],  // Burbo Bank, Merseyside
  // Additional well-known sites
  "E_GLSNB":   [ 0.558,  51.105],  // Glassenbury, Kent
  "E_COTPS":   [-0.776,  53.308],  // Cottam, Nottinghamshire
  "E_BLYTH":   [-1.513,  55.126],  // Blyth, Northumberland
  "E_DODDG":   [-0.296,  53.196],  // Doddington, Lincolnshire
  "E_HOLBW":   [-2.006,  50.719],  // Holes Bay, Dorset
  "E_WHILB":   [-4.217,  55.606],  // Whitelee, Scotland
  "E_CLAYT":   [-1.265,  52.378],  // Claybrooke, Warwickshire
  "E_CHAPB":   [-1.412,  53.214],  // Chapel, S. Yorkshire
  "E_DOLLB":   [-2.434,  57.156],  // Dalquhandy, Scotland
  "E_BERKB":   [-1.183,  51.404],  // Berkshire BESS
  "E_NTAWB":   [-3.007,  53.269],  // Nant y Moch area, N. Wales
  "E_WOLVB":   [-2.127,  52.579],  // Wolverhampton area
  "E_CLAYB":   [-1.265,  52.378],  // Claybrooke, Leics
  "E_PILLB":   [-0.408,  53.783],  // Pillswood variant
  "E_MINEB":   [-1.968,  51.634],  // Minety variant
  "T_HUMR":    [-0.167,  53.700],  // Humber region
  "T_GANW":    [-3.689,  58.590],  // Gordonbush, Scotland
  "E_HAWNB":   [-1.371,  54.813],  // Hawthorn Pit, Durham
  "E_NEVNB":   [ 0.479,  51.569],  // Nevendon, Essex
  "E_THURB":   [-1.239,  53.390],  // Thurcroft, S. Yorkshire
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

// Given a nationalGridBmUnit like "E_MINETY-1", return [lng, lat] if known.
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
