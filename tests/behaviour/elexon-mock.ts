/**
 * URL-routed fetch mock for Elexon endpoints.
 *
 * PN, BOALF, FUELINST and the BMU reference are fetched partly in parallel, so
 * call order is not a stable contract. Route by URL instead of mockResolvedValueOnce.
 */

export type Row = Record<string, unknown>;

export interface ElexonFixtures {
  bmu?: Row[];
  pn?: Row[] | "fail";
  boalf?: Row[] | "fail";
  fuelinst?: Row[] | "fail";
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status = 503) => ({ ok: false, status, statusText: "Service Unavailable", json: async () => ({}) });

export function routeElexon(mockFetch: jest.Mock, f: ElexonFixtures) {
  mockFetch.mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/reference/bmunits/all")) return ok({ data: f.bmu ?? [] });
    if (url.includes("/datasets/PN/stream")) return f.pn === "fail" ? fail() : ok(f.pn ?? []);
    if (url.includes("/datasets/BOALF/stream")) return f.boalf === "fail" ? fail() : ok(f.boalf ?? []);
    if (url.includes("/datasets/FUELINST")) return f.fuelinst === "fail" ? fail() : ok({ data: f.fuelinst ?? [] });
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

// One level segment. `to` defaults to one hour after `from`.
export function seg(bmu: string, level: number, from: string, opts: { to?: string; levelTo?: number; acc?: number } = {}): Row {
  return {
    nationalGridBmUnit: bmu,
    levelFrom: level,
    levelTo: opts.levelTo ?? level,
    timeFrom: from,
    timeTo: opts.to ?? new Date(Date.parse(from) + 3_600_000).toISOString(),
    ...(opts.acc !== undefined ? { acceptanceNumber: opts.acc } : {}),
  };
}

// Shapes mirror the live Elexon reference data (NG IDs carry no E_/T_ prefix)
export const BMU_REF: Row[] = [
  { nationalGridBmUnit: "PILLB-1", bmUnitType: "E", fuelType: null, bmUnitName: "Pillswood 1 Battery Storage", generationCapacity: "100", demandCapacity: "-100", leadPartyName: "BP Gas Marketing Limited", gspGroupId: "_M", gspGroupName: "Yorkshire" },
  { nationalGridBmUnit: "KILSB-1", bmUnitType: "T", fuelType: null, bmUnitName: "T_KILSB-1", generationCapacity: "50", demandCapacity: "-50", leadPartyName: "ZENOBE KILMARNOCK SOUTH LTD" },
  { nationalGridBmUnit: "KILSB-2", bmUnitType: "T", fuelType: null, bmUnitName: "T_KILSB-2", generationCapacity: "50", demandCapacity: "-50", leadPartyName: "ZENOBE KILMARNOCK SOUTH LTD" },
  { nationalGridBmUnit: "CLVHS-1", bmUnitType: "T", fuelType: "OTHER", bmUnitName: "Cleve Hill Solar 1", generationCapacity: "112", demandCapacity: "0" },
  { nationalGridBmUnit: "AG-AFLX01", bmUnitType: "S", fuelType: null, bmUnitName: "2__AFLEX001", generationCapacity: "49", demandCapacity: "0" },
];
