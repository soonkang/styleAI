import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recommendSize, type Gender } from "@/lib/size";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — MyStyle" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    gender: "unisex" as Gender,
    height_cm: "",
    weight_kg: "",
    top_size: "",
    bottom_size: "",
    style_preferences: "",
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setForm({
          full_name: data.full_name ?? "",
          gender: (data.gender as Gender) ?? "unisex",
          height_cm: data.height_cm?.toString() ?? "",
          weight_kg: data.weight_kg?.toString() ?? "",
          top_size: data.top_size ?? "",
          bottom_size: data.bottom_size ?? "",
          style_preferences: data.style_preferences ?? "",
        });
      }
      setLoading(false);
    })();
  }, [user.id]);

  const suggestion = useMemo(() => {
    const h = parseFloat(form.height_cm);
    const w = parseFloat(form.weight_kg);
    if (!h || !w) return null;
    return recommendSize(h, w, form.gender);
  }, [form.height_cm, form.weight_kg, form.gender]);

  async function save(useAi: boolean) {
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        full_name: form.full_name || null,
        gender: form.gender,
        height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
        top_size: useAi && suggestion ? suggestion.top : form.top_size || null,
        bottom_size: useAi && suggestion ? suggestion.bottom : form.bottom_size || null,
        style_preferences: form.style_preferences || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      if (useAi && suggestion) {
        setForm((f) => ({ ...f, top_size: suggestion.top, bottom_size: suggestion.bottom }));
      }
      toast.success("Profile saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl px-6 py-16 text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="eyebrow">Profile</p>
      <h1 className="mt-3 text-5xl font-serif">Your <em className="text-accent">measurements</em>.</h1>
      <p className="mt-3 text-muted-foreground">The more MyStyle knows, the sharper the brief.</p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field label="Full name">
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Gender">
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })} className={inputClass}>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="unisex">Unisex</option>
          </select>
        </Field>
        <Field label="Height (cm)">
          <input type="number" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Weight (kg)">
          <input type="number" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Top size">
          <input value={form.top_size} onChange={(e) => setForm({ ...form, top_size: e.target.value })} placeholder="e.g. M" className={inputClass} />
        </Field>
        <Field label="Bottom size">
          <input value={form.bottom_size} onChange={(e) => setForm({ ...form, bottom_size: e.target.value })} placeholder="e.g. 32 or 8" className={inputClass} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Style preferences">
            <textarea
              rows={3}
              value={form.style_preferences}
              onChange={(e) => setForm({ ...form, style_preferences: e.target.value })}
              placeholder="Minimalist, warm tones, no logos, comfortable for travel…"
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      {suggestion && (
        <div className="mt-8 border border-accent/40 bg-accent/5 p-6">
          <p className="eyebrow text-accent">Size suggestion</p>
          <div className="mt-3 flex flex-wrap gap-8 items-baseline">
            <div>
              <p className="text-xs text-muted-foreground">Top</p>
              <p className="font-serif text-3xl">{suggestion.top}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bottom</p>
              <p className="font-serif text-3xl">{suggestion.bottom}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Band</p>
              <p className="font-serif text-3xl">{suggestion.band}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">BMI</p>
              <p className="font-serif text-3xl">{suggestion.bmi}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{suggestion.note}</p>
          <button onClick={() => save(true)} disabled={saving} className="mt-5 border border-foreground px-5 py-2 text-sm hover:bg-foreground hover:text-background transition-colors">
            Use this size &amp; save
          </button>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <button onClick={() => save(false)} disabled={saving} className="bg-foreground text-background px-8 py-3 text-sm tracking-wider uppercase hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50">
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full bg-transparent border border-input px-4 py-3 text-sm focus:outline-none focus:border-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
