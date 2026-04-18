import { fetchStorageData, generateMockData } from "@/lib/elexon";
import type { ApiResponse } from "@/lib/elexon";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  let initialData: ApiResponse;

  try {
    const { data, source } = await fetchStorageData();
    initialData = {
      data,
      meta: { source, lastUpdated: new Date().toISOString(), count: data.length },
    };
  } catch {
    const data = generateMockData(24);
    initialData = {
      data,
      meta: { source: "mock", lastUpdated: new Date().toISOString(), count: data.length },
    };
  }

  return <Dashboard initialData={initialData} />;
}
