export interface PricePoint {
  time: string   // "HH:MM" London time
  price: number  // p/kWh inc. VAT (can be negative during surplus events)
}

export interface PricesResponse {
  data: PricePoint[]
  meta: { product: string }
}

function toLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export async function fetchAgilePrices(): Promise<PricesResponse> {
  // Dynamically discover the current Agile import product
  const productsRes = await fetch(
    "https://api.octopus.energy/v1/products/?is_variable=true&page_size=100",
    { cache: "no-store" }
  );
  if (!productsRes.ok) throw new Error(`Octopus products ${productsRes.status}`);
  const productsJson = await productsRes.json();

  const now = new Date();
  const agileProduct = (
    productsJson.results as Array<{
      code: string;
      available_from: string;
      available_to: string | null;
    }>
  )
    .filter(
      (p) =>
        p.code.startsWith("AGILE") &&
        !p.code.includes("OUTGOING") &&
        !p.code.includes("EXPORT") &&
        (p.available_to === null || new Date(p.available_to) > now)
    )
    .sort((a, b) => b.available_from.localeCompare(a.available_from))[0];

  if (!agileProduct) throw new Error("No active Agile import product found");

  const productCode = agileProduct.code;
  const tariffCode = `E-1R-${productCode}-A`; // Region A: Eastern England

  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD
  const nextDayStr = new Date(now.getTime() + 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "Europe/London",
  });

  const ratesRes = await fetch(
    `https://api.octopus.energy/v1/products/${productCode}/electricity-tariffs/${tariffCode}/standard-unit-rates/?period_from=${todayStr}T00:00:00Z&period_to=${nextDayStr}T01:00:00Z&page_size=100`,
    { cache: "no-store" }
  );
  if (!ratesRes.ok) throw new Error(`Agile rates ${ratesRes.status}`);
  const ratesJson = await ratesRes.json();

  const data: PricePoint[] = (
    ratesJson.results as Array<{
      value_inc_vat: number;
      valid_from: string;
    }>
  )
    .filter((r) => {
      const localDate = new Date(r.valid_from).toLocaleDateString("en-CA", {
        timeZone: "Europe/London",
      });
      return localDate === todayStr;
    })
    .map((r) => ({
      time: toLocalTime(r.valid_from),
      price: Math.round(r.value_inc_vat * 100) / 100,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return { data, meta: { product: productCode } };
}
