import TrackLookup from "@/components/TrackLookup";

// Public page — no session, nothing to prerender/cache.
export const dynamic = "force-dynamic";

export default function TrackLookupPage() {
  return <TrackLookup />;
}
