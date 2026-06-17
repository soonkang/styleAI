import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REKA_API = "https://api.reka.ai/v1";
const TEXT_MODEL = "reka-flash";
const LOVABLE_AI_API = "https://ai.gateway.lovable.dev/v1";
const GEMINI_IMAGE_MODEL = "google/gemini-2.5-flash-image";

function getRekaApiKey() {
  const key = process.env.REKA_API_KEY;
  if (!key) throw new Error("Missing REKA_API_KEY");
  return key;
}

function getLovableApiKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

async function callRekaChat(path: string, body: unknown) {
  const res = await fetch(`${REKA_API}${path}`, {
    method: "POST",
    headers: {
      "X-Api-Key": getRekaApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment and try again.");
    if (res.status === 401) throw new Error("Invalid Reka API key. Check that REKA_API_KEY is set correctly.");
    throw new Error(`Reka API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

async function fetchImageAsInlineData(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch reference image (${res.status})`);
  const mime = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { inlineData: { mimeType: mime, data: buf.toString("base64") } };
}

async function generateGeminiImage(prompt: string, referenceUrls: string[]) {
  const key = getGeminiApiKey();
  const refParts = await Promise.all(referenceUrls.map(fetchImageAsInlineData));
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }, ...refParts] }],
  });

  const maxAttempts = 4;
  let lastErr = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(
      `${GEMINI_API}/models/${GEMINI_IMAGE_MODEL}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body },
    );
    if (res.ok) {
      const payload = await res.json();
      const parts: Array<{ inlineData?: { mimeType?: string; data?: string } }> =
        payload?.candidates?.[0]?.content?.parts ?? [];
      const inline = parts.find((p) => p?.inlineData?.data);
      if (!inline?.inlineData?.data) throw new Error("No image returned by Gemini");
      const mime = inline.inlineData.mimeType || "image/png";
      return { bytes: Buffer.from(inline.inlineData.data, "base64"), mime, ext: (mime.split("/")[1] || "png") };
    }
    lastErr = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error("Invalid GEMINI_API_KEY.");
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`Gemini error ${res.status}: ${lastErr.slice(0, 300)}`);
    }
    // 429 or 5xx — exponential backoff: 2s, 5s, 12s
    if (attempt < maxAttempts - 1) {
      const waitMs = [2000, 5000, 12000][attempt] ?? 15000;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error(
    "Gemini free tier is rate-limited (a few image generations per minute). Please wait ~1 minute and try again, or upgrade your Gemini API plan.",
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function isRecoverableGeminiError(message: string) {
  return /gemini|rate.?limit|429|api key/i.test(message);
}


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

    const sgContext =
      " Tailor all suggestions to Singapore's tropical climate (hot 27-33C, humid, frequent rain, strong sun, cold aircon indoors): prioritise lightweight breathable fabrics (linen, cotton, tencel, modal), and mention a packable aircon layer or sun/rain consideration where useful.";
    const system =
      row.kind === "selfie"
        ? "You are a fashion stylist. Analyze the person's appearance: skin undertone (warm/cool/neutral), hair, eye color, body shape, and the colors and styles that would flatter them. Be concise and respectful." + sgContext
        : row.kind === "clothing"
          ? "You are a fashion stylist. Analyze this clothing item: type, color(s), material guess, formality, breathability for hot/humid weather, and 3 Singapore-appropriate outfit pairings it would work with." + sgContext
          : "You are a fashion stylist. Analyze this inspiration photo: aesthetic, dominant colors, key pieces, and how to recreate the look for Singapore weather at varying price points." + sgContext;

    const result = await callRekaChat("/chat/completions", {
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
    await context.supabase.from("uploads").update({ analysis: { text, model: TEXT_MODEL } }).eq("id", row.id);
    return { analysis: text };
  });

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
          "You are MyStyle, a personal fashion stylist based in Singapore. Recommend 3 distinct outfits tailored to the user's occasion, body, and preferences. " +
          "IMPORTANT CLIMATE CONTEXT: The user is in Singapore - hot (27-33C), humid (70-90%), with frequent rain and strong sun. Indoor venues (malls, offices, MRT) are heavily air-conditioned and cold. " +
          "Default to lightweight, breathable, sweat-friendly fabrics (linen, cotton, tencel, modal, performance knits). Avoid wool, heavy denim, leather, thick layers, and anything that traps heat. " +
          "Always include at least one practical Singapore touch where relevant: a packable light layer for aircon, breathable footwear, sun/rain consideration, or moisture-wicking fabric. " +
          "Reference Singapore-accessible retailers in search_query when sensible (Uniqlo, Zara, Cotton On, Love Bonito, Charles & Keith, Pedro, Lazada, Shopee, Zalora). " +
          "Always respond with VALID JSON only - no prose, no markdown fences - matching this schema:\n" +
          `{"outfits":[{"name":string,"summary":string,"items":[{"category":string,"description":string,"color":string,"search_query":string}],"why_it_works":string,"styling_tips":[string]}]}\n` +
          "search_query should be a short phrase a user can paste into Google Shopping, Zalora, or Lazada to find that piece.",
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
              (selfieUrl ? "A selfie of the user is attached - use their visible coloring." : ""),
          },
          ...(selfieUrl ? [{ type: "image_url", image_url: { url: selfieUrl } }] : []),
        ],
      },
    ];

    const result = await callRekaChat("/chat/completions", {
      model: TEXT_MODEL,
      messages,
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
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { outfits: [] };
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
      `A model wearing this outfit: ${outfit.name ?? ""}. ${outfit.summary ?? ""}. ` +
      `Pieces: ${itemsText}. Occasion: ${rec.occasion}. ` +
      (selfieUrl
        ? "Use the attached person's face, hair, skin tone, and body shape faithfully."
        : "Anonymous model with relaxed pose, suitable for Singapore tropical climate.");

    let generated: Awaited<ReturnType<typeof generateGeminiImage>>;
    try {
      generated = await generateGeminiImage(prompt, selfieUrl ? [selfieUrl] : []);
    } catch (error) {
      const message = getErrorMessage(error);
      if (isRecoverableGeminiError(message)) {
        return { ok: false as const, error: message, retryAfterSeconds: 60 };
      }
      throw error;
    }
    const { bytes, mime, ext } = generated;
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
    return { ok: true as const, url: signed?.signedUrl ?? "", path };
  });

