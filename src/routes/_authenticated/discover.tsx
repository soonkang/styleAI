import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recommendOutfits, analyzeUpload, generateTryOn } from "@/lib/style-ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover — StyleAI" }] }),
  component: Discover,
});

const OCCASIONS = [
  "First date dinner",
  "Job interview",
  "Wedding guest",
  "Weekend brunch",
  "Beach vacation",
  "Business meeting",
  "Cocktail party",
  "Concert / festival",
];
const CATEGORIES = ["Any", "Casual", "Smart casual", "Formal", "Streetwear", "Minimal", "Athleisure"];

type Outfit = {
  name: string;
  summary: string;
  items: Array<{ category: string; description: string; color: string; search_query: string }>;
  why_it_works: string;
  styling_tips: string[];
};

function Discover() {
  const { user } = Route.useRouteContext();
  const recFn = useServerFn(recommendOutfits);
  const analyzeFn = useServerFn(analyzeUpload);
  const tryOnFn = useServerFn(generateTryOn);

  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [category, setCategory] = useState("Any");
  const [notes, setNotes] = useState("");
  const [selfieId, setSelfieId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [result, setResult] = useState<{ id: string; outfits: Outfit[] } | null>(null);
  const [tryOnImages, setTryOnImages] = useState<Record<number, string>>({});
  const [tryOnLoading, setTryOnLoading] = useState<Record<number, boolean>>({});
  const tryOnBusy = Object.values(tryOnLoading).some(Boolean);

  async function visualize(index: number) {
    if (!result || tryOnBusy) return;
    setTryOnLoading((s) => ({ ...s, [index]: true }));
    try {
      const res = await tryOnFn({ data: { recommendationId: result.id, outfitIndex: index } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTryOnImages((s) => ({ ...s, [index]: res.url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate visual");
    } finally {
      setTryOnLoading((s) => ({ ...s, [index]: false }));
    }
  }


  const selfies = useQuery({
    queryKey: ["selfies", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("uploads")
        .select("id, storage_path, created_at")
        .eq("user_id", user.id)
        .eq("kind", "selfie")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function onSelfieUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8MB");
      e.target.value = "";
      return;
    }
    setUploadingSelfie(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/selfie-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("user-uploads").upload(path, file, {
        contentType: file.type,
      });
      if (error) throw error;
      const { data: row, error: insErr } = await supabase
        .from("uploads")
        .insert({ user_id: user.id, kind: "selfie", storage_path: path })
        .select("id")
        .single();
      if (insErr) throw insErr;
      toast.success("Selfie uploaded. Analyzing…");
      setSelfieId(row.id);
      selfies.refetch();
      analyzeFn({ data: { uploadId: row.id } })
        .then(() => {
          toast.success("Selfie analysis ready.");
          selfies.refetch();
        })
        .catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSelfie(false);
      e.target.value = "";
    }
  }

  async function generate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await recFn({
        data: {
          occasion,
          category: category === "Any" ? undefined : category,
          notes: notes || undefined,
          selfieUploadId: selfieId || undefined,
        },
      });
      setResult(res);
      toast.success("Three looks composed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <p className="eyebrow">Discover</p>
      <h1 className="mt-3 text-5xl font-serif">Compose a <em className="text-accent">look</em>.</h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        Tell us the occasion and we'll suggest three complete outfits with shoppable references — tap Shop on any piece to find it online.
      </p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 border border-border p-8 bg-card">
        <label className="block md:col-span-2">
          <span className="eyebrow">Occasion</span>
          <input
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            className="mt-2 w-full bg-transparent border border-input px-4 py-3 text-lg font-serif focus:outline-none focus:border-foreground"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {OCCASIONS.map((o) => (
              <button
                key={o}
                onClick={() => setOccasion(o)}
                className={`text-xs px-3 py-1 border ${
                  occasion === o ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="eyebrow">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-2 w-full bg-transparent border border-input px-4 py-3 text-sm focus:outline-none focus:border-foreground"
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="eyebrow">Selfie (optional)</span>
          <select
            value={selfieId}
            onChange={(e) => setSelfieId(e.target.value)}
            className="mt-2 w-full bg-transparent border border-input px-4 py-3 text-sm focus:outline-none focus:border-foreground"
          >
            <option value="">— None —</option>
            {selfies.data?.map((s) => (
              <option key={s.id} value={s.id}>Selfie from {new Date(s.created_at).toLocaleDateString()}</option>
            ))}
          </select>
          <label className="mt-2 inline-block text-xs border-b border-foreground cursor-pointer hover:text-accent hover:border-accent">
            {uploadingSelfie ? "Uploading…" : "+ Upload a new selfie"}
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={onSelfieUpload}
              disabled={uploadingSelfie}
              className="hidden"
            />
          </label>
        </label>

        <label className="block md:col-span-2">
          <span className="eyebrow">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Outdoor, warm weather, no heels…"
            className="mt-2 w-full bg-transparent border border-input px-4 py-3 text-sm focus:outline-none focus:border-foreground"
          />
        </label>

        <button
          onClick={generate}
          disabled={loading}
          className="md:col-span-2 bg-foreground text-background py-4 text-sm tracking-widest uppercase hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
        >
          {loading ? "Composing your looks…" : "Generate outfits"}
        </button>
      </div>

      {result && (
        <div className="mt-16 space-y-16">
          {result.outfits.map((o, i) => (
            <article key={i} className="border border-border bg-card p-8">
              <p className="eyebrow">Look Nº0{i + 1}</p>
              <h2 className="mt-2 text-4xl font-serif">{o.name}</h2>
              <p className="mt-4 text-muted-foreground">{o.summary}</p>

              {tryOnImages[i] && (
                <img
                  src={tryOnImages[i]}
                  alt={`Visualization of ${o.name}`}
                  className="mt-6 w-full max-w-md border border-border"
                />
              )}
              <button
                onClick={() => visualize(i)}
                disabled={tryOnLoading[i] || tryOnBusy}
                className="mt-4 text-xs tracking-widest uppercase border border-foreground px-4 py-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50"
              >
                {tryOnLoading[i] ? "Rendering…" : tryOnImages[i] ? "Regenerate visual" : "Visualize this look"}
              </button>

              <h3 className="mt-8 eyebrow">The pieces</h3>
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
                  <ul className="mt-2 space-y-1 text-sm list-['—__'] list-inside text-muted-foreground">
                    {o.styling_tips.map((t, k) => <li key={k}>{t}</li>)}
                  </ul>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
