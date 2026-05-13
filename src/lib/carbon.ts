export interface CarbonPoint {
  time: string      // "HH:MM" London time
  intensity: number // gCO2eq/kWh (actual if available, else forecast)
  index: string     // "very low" | "low" | "moderate" | "high" | "very high"
}

export interface CarbonResponse {
  data: CarbonPoint[]
  meta: { date: string }
}

export async function fetchCarbonIntensity(): Promise<CarbonResponse> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD

  const res = await fetch(`https://api.carbonintensity.org.uk/intensity/date/${today}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Carbon intensity API ${res.status}`);
  const json = await res.json();

  const data: CarbonPoint[] = (
    json.data as Array<{
      from: string;
      intensity: { forecast: number; actual: number | null; index: string };
    }>
  ).map((d) => ({
    time: new Date(d.from).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    }),
    intensity: d.intensity.actual ?? d.intensity.forecast,
    index: d.intensity.index,
  }));

  return { data, meta: { date: today } };
}
