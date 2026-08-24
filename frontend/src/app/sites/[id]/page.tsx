import { DetailView } from "@/components/detail/DetailView";

// Parse the route id to a positive integer. Anything else (a non-numeric slug,
// a negative, a float) can never be an active site id, so we hand the view a
// null id and it renders the same not-found response as an unknown record —
// never revealing whether an inactive record exists.
function parseSiteId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DetailView siteId={parseSiteId(id)} />;
}
