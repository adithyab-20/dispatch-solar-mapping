import Link from "next/link";

// Placeholder for the site detail experience, which lands in ticket #9. The
// route exists now so every catalogue row and map marker has a real target to
// navigate to. It performs no data fetching and triggers no provider work.
export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main style={{ padding: 24 }}>
      <Link href="/" style={{ color: "var(--solar)" }}>
        ← All sites
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 12 }}>Site #{id}</h1>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        The full site detail and solar-results experience arrives in a later
        slice.
      </p>
    </main>
  );
}
