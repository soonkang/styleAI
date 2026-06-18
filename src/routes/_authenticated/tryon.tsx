import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { customTryOn } from "@/lib/style-ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tryon")({
  head: () => ({ meta: [{ title: "Virtual Try-On — MyStyle" }] }),
  component: TryOn,
});

type Kind = "selfie" | "clothing";

function TryOn() {
  const { user } = Route.useRouteContext();
  const tryOnFn = useServerFn(customTryOn);

  const [selfieId, setSelfieId] = useState<string>("");
  const [clothingIds, setClothingIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState<Kind | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const coolingDown = Date.now() < cooldownUntil;

  useEffect(() => {
    if (!coolingDown) return;
    const t = window.setTimeout(() => setCooldownUntil(0), Math.max(0, cooldownUntil - Date.now()));
    return () => window.clearTimeout(t);
  }, [coolingDown, cooldownUntil]);

  const uploads = useQuery({
    queryKey: ["uploads", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("uploads")
        .select("id, kind, storage_path, created_at")
        .eq("user_id", user.id)
        .in("kind", ["selfie", "clothing"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const withUrls = await Promise.all(
        (data ?? []).map(async (u) => {
          const { data: s } = await supabase.storage
            .from("user-uploads")
            .createSignedUrl(u.storage_path, 60 * 30);
          return { ...u, url: s?.signedUrl ?? "" };
        }),
      );
      return withUrls;
    },
  });

  const selfies = (uploads.data ?? []).filter((u) => u.kind === "selfie");
  const clothes = (uploads.data ?? []).filter((u) => u.kind === "clothing");

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>, kind: Kind) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8MB");
      e.target.value = "";
      return;
    }
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("user-uploads").upload(path, file, {
        contentType: file.type,
      });
      if (error) throw error;
      const { data: row, error: insErr } = await supabase
        .from("uploads")
        .insert({ user_id: user.id, kind, storage_path: path })
        .select("id")
        .single();
      if (insErr) throw insErr;
      toast.success(`${kind === "selfie" ? "Selfie" : "Clothing"} uploaded.`);
      await uploads.refetch();
      if (kind === "selfie") setSelfieId(row.id);
      else setClothingIds((s) => [...s, row.id]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  }

  function toggleClothing(id: string) {
    setClothingIds((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 5 ? s : [...s, id],
    );
  }

  async function generate() {
    if (!selfieId) return toast.error("Select a selfie first");
    if (clothingIds.length === 0) return toast.error("Select at least one clothing piece");
    setLoading(true);
    setResultUrl(null);
    try {
      const res = await tryOnFn({
        data: { selfieUploadId: selfieId, clothingUploadIds: clothingIds, notes: notes || undefined },
      });
      if (!res.ok) {
        setCooldownUntil(Date.now() + (res.retryAfterSeconds ?? 60) * 1000);
        toast.error(res.error);
        return;
      }
      setResultUrl(res.url);
      toast.success("Your try-on is ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <p className="eyebrow">Virtual Try-On</p>
      <h1 className="mt-3 text-5xl font-serif">
        See yourself in <em className="text-accent">anything</em>.
      </h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        Pick a selfie and one or more clothing pieces from your wardrobe — or upload new ones — and we'll render you wearing them.
      </p>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="border border-border bg-card p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="eyebrow">1. Your selfie</h2>
            <label className="text-xs border-b border-foreground cursor-pointer hover:text-accent hover:border-accent">
              {uploading === "selfie" ? "Uploading…" : "+ Upload"}
              <input type="file" accept="image/*" capture="user" className="hidden"
                onChange={(e) => onUpload(e, "selfie")} disabled={uploading !== null} />
            </label>
          </div>
          {selfies.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No selfies yet — upload one above.</p>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {selfies.map((s) => (
                <button key={s.id} onClick={() => setSelfieId(s.id)}
                  className={`relative aspect-[3/4] overflow-hidden border-2 ${
                    selfieId === s.id ? "border-accent" : "border-transparent hover:border-border"
                  }`}>
                  {s.url && <img src={s.url} alt="selfie" className="w-full h-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="border border-border bg-card p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="eyebrow">2. Clothing ({clothingIds.length}/5)</h2>
            <label className="text-xs border-b border-foreground cursor-pointer hover:text-accent hover:border-accent">
              {uploading === "clothing" ? "Uploading…" : "+ Upload"}
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => onUpload(e, "clothing")} disabled={uploading !== null} />
            </label>
          </div>
          {clothes.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No clothing pieces yet — upload one above.</p>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {clothes.map((c) => {
                const i = clothingIds.indexOf(c.id);
                const selected = i >= 0;
                return (
                  <button key={c.id} onClick={() => toggleClothing(c.id)}
                    className={`relative aspect-[3/4] overflow-hidden border-2 ${
                      selected ? "border-accent" : "border-transparent hover:border-border"
                    }`}>
                    {c.url && <img src={c.url} alt="clothing" className="w-full h-full object-cover" />}
                    {selected && (
                      <span className="absolute top-1 left-1 bg-accent text-accent-foreground text-[10px] px-1.5 py-0.5">
                        {i + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 border border-border bg-card p-6">
        <label className="block">
          <span className="eyebrow">Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Tuck the shirt in, casual pose, outdoor setting…"
            className="mt-2 w-full bg-transparent border border-input px-4 py-3 text-sm focus:outline-none focus:border-foreground" />
        </label>
        <button onClick={generate} disabled={loading || coolingDown}
          className="mt-4 w-full bg-foreground text-background py-4 text-sm tracking-widest uppercase hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50">
          {loading ? "Rendering your try-on…" : coolingDown ? "Try again in 1 minute" : "Generate try-on"}
        </button>
      </div>

      {resultUrl && (
        <div className="mt-12 border border-border bg-card p-8">
          <p className="eyebrow">Your virtual try-on</p>
          <img src={resultUrl} alt="Virtual try-on result" className="mt-4 w-full max-w-xl border border-border" />
          <a href={resultUrl} target="_blank" rel="noreferrer"
            className="mt-4 inline-block text-xs border-b border-foreground hover:text-accent hover:border-accent">
            Open full size ↗
          </a>
        </div>
      )}
    </div>
  );
}
