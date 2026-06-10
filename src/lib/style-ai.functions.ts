import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const TEXT_MODEL = "google/gemini-2.5-flash";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";

async function callGateway(path: string, body: unknown) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment and try again.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up to keep using StyleAI.");
    throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────
// Sign URL for a private storage object (so the AI can fetch it).
// ─────────────────────────────────────────────────────────────
export const getSignedUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bucket: z.string(), path: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from(data.bucket)
      .createSignedUrl(data.path, 60 * 60);
    if (error || !signed) throw new Error(error?.message ?? "Could not sign URL");
    return { url: signed.signedUrl };
  });

// ─────────────────────────────────────────────────────────────
// Analyze an uploaded image (selfie / clothing / inspiration).
// ─────────────────────────────────────────────────────────────
export const analyzeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      uploadId: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("uploads")
      .select("id,kind,storage_path")
      .eq("id", data.uploadId)
      .single();
    if (error || !row) throw new Error("Upload not found");

    const { data: signed } = await context.supabase.storage
      .from("user-uploads")
      .createSignedUrl(row.storage_path, 60 * 10);
    if (!signed) throw new Error("Could not sign image");

    const system =
      row.kind === "selfie"
        ? "You are a fashion stylist. Analyze the person's appearance: skin undertone (warm/cool/neutral), hair, eye color, body shape, and the colors and styles that would flatter them. Be concise and respectful."
        : row.kind === "clothing"
          ? "You are a fashion stylist. Analyze this clothing item: type, color(s), material guess, formality, season, and 3 outfit pairings it would work with."
          : "You are a fashion stylist. Analyze this inspiration photo: aesthetic, dominant colors, key pieces, and how to recreate the look at varying price points.";

    const result = await callGateway("/chat/completions", {
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Please analyze this image. Return clear markdown with short headings." },
            { type: "image_url", image_url: { url: signed.signedUrl } },
          ],
        },
      ],
    });

    const text: string = result?.choices?.[0]?.message?.content ?? "";
    await context.supabase
      .from("uploads")
      .update({ analysis: { text, model: TEXT_MODEL } })
      .eq("id", row.id);
    return { analysis: text };
  });

// ─────────────────────────────────────────────────────────────
// Recommend outfits for an occasion / category.
// ─────────────────────────────────────────────────────────────
export const recommendOutfits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      occasion: z.string().min(2).max(120),
      category: z.string().max(60).optional(),
      notes: z.string().max(500).optional(),
      selfieUploadId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name, gender, height_cm, weight_kg, top_size, bottom_size, style_preferences")
      .eq("user_id", context.userId)
      .maybeSingle();

    let selfieUrl: string | null = null;
    if (data.selfieUploadId) {
      const { data: up } = await context.supabase
        .from("uploads")
        .select("storage_path")
        .eq("id", data.selfieUploadId)
        .single();
      if (up) {
        const { data: signed } = await context.supabase.storage
          .from("user-uploads")
          .createSignedUrl(up.storage_path, 60 * 10);
        selfieUrl = signed?.signedUrl ?? null;
      }
    }

    const messages: Array<Record<string, unknown>> = [
      {
        role: "system",
        content:
          "You are StyleAI, a personal fashion stylist. Recommend 3 distinct outfits tailored to the user's occasion, body, and preferences. Always respond with VALID JSON only — no prose, no markdown fences — matching this schema:\n" +
          `{"outfits":[{"name":string,"summary":string,"items":[{"category":string,"description":string,"color":string,"search_query":string}],"why_it_works":string,"styling_tips":[string]}]}\n` +
          "search_query should be a short phrase a user can paste into Google Shopping or ASOS to find that piece.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Occasion: ${data.occasion}\n` +
              (data.category ? `Category preference: ${data.category}\n` : "") +
              (data.notes ? `Additional notes: ${data.notes}\n` : "") +
              `\nProfile: ${JSON.stringify(profile ?? {})}\n` +
              (selfieUrl ? "A selfie of the user is attached — use their visible coloring." : ""),
          },
          ...(selfieUrl ? [{ type: "image_url", image_url: { url: selfieUrl } }] : []),
        ],
      },
    ];

    const result = await callGateway("/chat/completions", {
      model: TEXT_MODEL,
      messages,
      response_format: { type: "json_object" },
    });

    const content: string = result?.choices?.[0]?.message?.content ?? "{}";
    type OutfitItem = { category: string; description: string; color: string; search_query: string };
    type Outfit = {
      name: string;
      summary: string;
      items: OutfitItem[];
      why_it_works: string;
      styling_tips: string[];
    };
    let parsed: { outfits: Outfit[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { outfits: [] };
    }
    if (!Array.isArray(parsed.outfits)) parsed.outfits = [];

    const { data: saved, error } = await context.supabase
      .from("recommendations")
      .insert({
        user_id: context.userId,
        occasion: data.occasion,
        category: data.category ?? null,
        prompt: data.notes ?? null,
        outfits: JSON.parse(JSON.stringify(parsed)),
        selfie_upload_id: data.selfieUploadId ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: saved.id, outfits: parsed.outfits };
  });

// ─────────────────────────────────────────────────────────────
// Virtual try-on: generate an image of an outfit, optionally guided by selfie.
// ─────────────────────────────────────────────────────────────
export const generateTryOn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      recommendationId: z.string().uuid(),
      outfitIndex: z.number().int().min(0).max(10),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rec, error } = await context.supabase
      .from("recommendations")
      .select("id, outfits, occasion, selfie_upload_id")
      .eq("id", data.recommendationId)
      .single();
    if (error || !rec) throw new Error("Recommendation not found");

    const outfits = (rec.outfits as { outfits?: unknown[] })?.outfits ?? [];
    const outfit = outfits[data.outfitIndex] as
      | { name?: string; summary?: string; items?: Array<{ description?: string; color?: string }> }
      | undefined;
    if (!outfit) throw new Error("Outfit not found");

    const itemsText =
      outfit.items?.map((i) => `${i.color ?? ""} ${i.description ?? ""}`.trim()).join(", ") ?? "";

    let selfieUrl: string | null = null;
    if (rec.selfie_upload_id) {
      const { data: up } = await context.supabase
        .from("uploads")
        .select("storage_path")
        .eq("id", rec.selfie_upload_id)
        .single();
      if (up) {
        const { data: signed } = await context.supabase.storage
          .from("user-uploads")
          .createSignedUrl(up.storage_path, 60 * 10);
        selfieUrl = signed?.signedUrl ?? null;
      }
    }

    const prompt =
      `Editorial full-body fashion photograph, soft natural light, neutral studio backdrop. ` +
      `Outfit: ${outfit.name ?? ""}. ${outfit.summary ?? ""}. ` +
      `Pieces: ${itemsText}. ` +
      `Occasion: ${rec.occasion}. ` +
      (selfieUrl
        ? "Use the attached person's face, hair, and skin tone faithfully — do not change their identity."
        : "Anonymous model with neutral pose.");

    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    if (selfieUrl) userContent.push({ type: "image_url", image_url: { url: selfieUrl } });

    const result = await callGateway("/chat/completions", {
      model: IMAGE_MODEL,
      messages: [{ role: "user", content: userContent }],
      modalities: ["image", "text"],
    });

    // Gemini image returns base64 in choices[0].message.images[0].image_url.url
    const msg = result?.choices?.[0]?.message;
    const imgUrl: string | undefined =
      msg?.images?.[0]?.image_url?.url ?? msg?.images?.[0]?.url;
    if (!imgUrl) throw new Error("No image returned by the model");

    // imgUrl is data:image/png;base64,xxxx
    const m = imgUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw new Error("Unexpected image format");
    const mime = m[1];
    const ext = mime.split("/")[1];
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const path = `${context.userId}/${rec.id}-${data.outfitIndex}-${Date.now()}.${ext}`;

    const { error: upErr } = await context.supabase.storage
      .from("tryons")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) throw new Error(upErr.message);

    await context.supabase
      .from("recommendations")
      .update({ tryon_image_path: path })
      .eq("id", rec.id);

    const { data: signed } = await context.supabase.storage
      .from("tryons")
      .createSignedUrl(path, 60 * 60);
    return { url: signed?.signedUrl ?? "", path };
  });
