// Backward-compatible alias: the main data endpoint lives at /api/elexon.
// Segment config must be literal here (Next.js does not follow re-exports for it).
export { GET } from "./elexon/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;
