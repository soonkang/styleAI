import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { analyzeUpload, getSignedUploadUrl } from "@/lib/style-ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wardrobe")({
  head: () => ({ meta: [{ title: "Wardrobe — StyleAI" }] }),
  component: Wardrobe,
});

type Kind = "selfie" | "clothing" | "inspiration";

function Wardrobe() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("selfie");
  const [uploading, setUploading] = useState(false);
  const analyze = useServerFn(analyzeUpload);
  const sign = useServerFn(getSignedUploadUrl);

  const list = useQuery({
    queryKey: ["uploads", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("uploads")
        .select("id, kind, storage_path, analysis, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // sign urls for thumbnails
      const withUrls = await Promise.all(
        (data ?? []).map(async (u) => {
          const { data: s } = await supabase.storage.from("user-uploads").createSignedUrl(u.storage_path, 60 * 30);
          return { ...u, url: s?.signedUrl ?? "" };
        }),
      );
      return withUrls;
    },
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8MB");
      return;
    }
    setUploading(true);
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
      toast.success("Uploaded. Analyzing…");
      qc.invalidateQueries({ queryKey: ["uploads", user.id] });
      await analyze({ data: { uploadId: row.id } });
      toast.success("Analysis ready.");
      qc.invalidateQueries({ queryKey: ["uploads", user.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <p className="eyebrow">Wardrobe</p>
      <h1 className="mt-3 text-5xl font-serif">Your visual <em className="text-accent">library</em>.</h1>
      <p className="mt-3 text-muted-foreground max-w-xl">
        Upload selfies, clothing pieces, or inspiration. StyleAI reads color, fit and styling cues.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        {(["selfie", "clothing", "inspiration"] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`px-5 py-2 text-sm uppercase tracking-wider border ${
              kind === k ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"
            }`}
          >
            {k}
          </button>
        ))}
        <label className="ml-auto bg-accent text-accent-foreground px-6 py-2 text-sm cursor-pointer hover:opacity-90">
          {uploading ? "Uploading…" : "Upload image"}
          <input type="file" accept="image/*" onChange={onFile} disabled={uploading} className="hidden" />
        </label>
      </div>

      <div className="hairline my-8" />

      {list.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : list.data && list.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {list.data.map((u) => (
            <article key={u.id} className="border border-border">
              {u.url && (
                <img src={u.url} alt={u.kind} loading="lazy" className="w-full aspect-[4/5] object-cover bg-muted" />
              )}
              <div className="p-6">
                <p className="eyebrow">{u.kind}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString()}</p>
                <div className="mt-4 prose prose-sm prose-neutral max-w-none">
                  {(u.analysis as { text?: string } | null)?.text ? (
                    <ReactMarkdown>{(u.analysis as { text?: string }).text!}</ReactMarkdown>
                  ) : (
                    <button
                      onClick={async () => {
                        toast.message("Analyzing…");
                        await analyze({ data: { uploadId: u.id } });
                        qc.invalidateQueries({ queryKey: ["uploads", user.id] });
                      }}
                      className="text-sm border border-foreground px-4 py-2 hover:bg-foreground hover:text-background"
                    >
                      Analyze with AI
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">Nothing here yet — upload your first image above.</p>
      )}
    </div>
  );
}
