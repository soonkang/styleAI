import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Atelier — StyleAI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();

  const profile = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const recent = useQuery({
    queryKey: ["recent-recs", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommendations")
        .select("id, occasion, category, created_at, tryon_image_path")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <p className="eyebrow">Atelier</p>
      <h1 className="mt-3 text-5xl font-serif">
        Welcome, <em className="text-accent">{profile.data?.full_name?.split(" ")[0] ?? "friend"}</em>.
      </h1>
      <p className="mt-4 text-muted-foreground max-w-xl">
        Every great wardrobe starts with the right brief. Tell us the occasion and we'll do the editing.
      </p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link to="/discover" className="border border-border p-8 hover:border-accent transition-colors group">
          <p className="eyebrow">01</p>
          <h3 className="mt-4 text-2xl font-serif group-hover:text-accent">Style an occasion</h3>
          <p className="mt-2 text-sm text-muted-foreground">Get three outfits, ready to wear.</p>
        </Link>
        <Link to="/wardrobe" className="border border-border p-8 hover:border-accent transition-colors group">
          <p className="eyebrow">02</p>
          <h3 className="mt-4 text-2xl font-serif group-hover:text-accent">Upload &amp; analyze</h3>
          <p className="mt-2 text-sm text-muted-foreground">Selfies, pieces, inspiration — read by the AI.</p>
        </Link>
        <Link to="/profile" className="border border-border p-8 hover:border-accent transition-colors group">
          <p className="eyebrow">03</p>
          <h3 className="mt-4 text-2xl font-serif group-hover:text-accent">Refine your fit</h3>
          <p className="mt-2 text-sm text-muted-foreground">Measurements drive size recommendations.</p>
        </Link>
      </div>

      <div className="mt-20">
        <div className="flex items-end justify-between">
          <h2 className="text-3xl font-serif">Recent looks</h2>
          <Link to="/discover" className="text-sm border-b border-foreground hover:text-accent hover:border-accent">
            New session
          </Link>
        </div>
        <div className="hairline mt-4" />
        {recent.isLoading ? (
          <p className="mt-8 text-muted-foreground text-sm">Loading…</p>
        ) : recent.data && recent.data.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {recent.data.map((r) => (
              <Link
                key={r.id}
                to="/looks/$id"
                params={{ id: r.id }}
                className="border border-border p-6 hover:border-accent transition-colors group"
              >
                <p className="eyebrow">{r.category ?? "Occasion"}</p>
                <h3 className="mt-2 font-serif text-xl group-hover:text-accent">{r.occasion}</h3>
                <p className="mt-3 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
                <p className="mt-4 text-xs border-b border-foreground inline-block group-hover:text-accent group-hover:border-accent">
                  View look →
                </p>
              </Link>
            ))}
          </div>

        ) : (
          <p className="mt-8 text-muted-foreground text-sm">No looks yet — start your first session.</p>
        )}
      </div>
    </div>
  );
}
