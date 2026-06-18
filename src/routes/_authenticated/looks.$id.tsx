import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/looks/$id")({
  head: () => ({ meta: [{ title: "Look — MyStyle" }] }),
  component: LookDetail,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Could not load this look.</p>
        <p className="mt-2 text-xs text-red-500">{error.message}</p>
        <button
          onClick={() => { reset(); router.invalidate(); }}
          className="mt-4 text-sm border border-foreground px-4 py-2 hover:bg-foreground hover:text-background"
        >
          Retry
        </button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="font-serif text-3xl">Look not found.</p>
      <Link to="/dashboard" className="mt-4 inline-block text-sm border-b border-foreground hover:text-accent hover:border-accent">
        Back to dashboard
      </Link>
    </div>
  ),
});

type OutfitItem = { category: string; description: string; color: string; search_query: string };
type Outfit = {
  name: string;
  summary: string;
  items: OutfitItem[];
  why_it_works: string;
  styling_tips: string[];
};

function LookDetail() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();

  const q = useQuery({
    queryKey: ["recommendation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommendations")
        .select("id, occasion, category, created_at, outfits, tryon_image_path")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Look not found");
      let tryonUrl: string | null = null;
      if (data.tryon_image_path) {
        const { data: s } = await supabase.storage
          .from("tryons")
          .createSignedUrl(data.tryon_image_path, 60 * 30);
        tryonUrl = s?.signedUrl ?? null;
      }
      return { ...data, tryonUrl };
    },
  });

  if (q.isLoading) {
    return <p className="mx-auto max-w-3xl px-6 py-12 text-muted-foreground">Loading…</p>;
  }
  if (!q.data) return null;

  const outfits = ((q.data.outfits as { outfits?: Outfit[] })?.outfits ?? []) as Outfit[];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link to="/dashboard" className="eyebrow hover:text-accent">← Back to dashboard</Link>
      <p className="eyebrow mt-6">{q.data.category ?? "Occasion"}</p>
      <h1 className="mt-2 text-5xl font-serif">{q.data.occasion}</h1>
      <p className="mt-3 text-xs text-muted-foreground">
        {new Date(q.data.created_at).toLocaleString()}
      </p>

      {q.data.tryonUrl && (
        <img src={q.data.tryonUrl} alt="Outfit visualization" className="mt-8 w-full max-w-md border border-border" />
      )}

      <div className="mt-12 space-y-12">
        {outfits.map((o, i) => (
          <article key={i} className="border border-border bg-card p-8">
            <p className="eyebrow">Look Nº0{i + 1}</p>
            <h2 className="mt-2 text-3xl font-serif">{o.name}</h2>
            <p className="mt-3 text-muted-foreground">{o.summary}</p>

            <h3 className="mt-6 eyebrow">The pieces</h3>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {o.items?.map((it, j) => (
                <li key={j} className="py-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium">{it.description}</p>
                    <p className="text-xs text-muted-foreground">{it.category} · {it.color}</p>
                  </div>
                  <a
                    href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(it.search_query || it.description)}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs border-b border-foreground hover:text-accent hover:border-accent"
                  >
                    Shop ↗
                  </a>
                </li>
              ))}
            </ul>

            <h3 className="mt-6 eyebrow">Why it works</h3>
            <p className="mt-2 text-sm leading-relaxed">{o.why_it_works}</p>

            {o.styling_tips?.length > 0 && (
              <>
                <h3 className="mt-6 eyebrow">Styling notes</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {o.styling_tips.map((t, k) => <li key={k}>— {t}</li>)}
                </ul>
              </>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
