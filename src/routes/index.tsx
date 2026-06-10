import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { useAuth } from "@/hooks/use-auth";
import heroImage from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StyleAI — Your personal AI stylist" },
      { name: "description", content: "Upload a selfie, share an occasion, and get tailored outfits, sizing guidance, and AI-generated try-ons." },
      { property: "og:title", content: "StyleAI — Your personal AI stylist" },
      { property: "og:description", content: "Upload a selfie, share an occasion, and get tailored outfits, sizing guidance, and AI-generated try-ons." },
      { property: "og:image", content: heroImage },
      { name: "twitter:image", content: heroImage },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <Nav authed={!!user} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-16 lg:py-28">
          <div>
            <p className="eyebrow uppercase tracking-[0.2em]">YOUR AI FASHION STYLER</p>
            <h1 className="mt-6 text-5xl md:text-7xl leading-[0.95]">
              Dress with<br />
              <em className="text-accent">intention.</em>
            </h1>
            <p className="mt-8 text-lg text-muted-foreground max-w-md leading-relaxed">
              StyleAI studies your features, your measurements, and the moment —
              then composes outfits that feel unmistakably yours.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to={user ? "/discover" : "/auth"}
                className="bg-foreground text-background px-8 py-4 text-sm tracking-wider uppercase hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {user ? "Open the atelier" : "Begin your fitting"}
              </Link>
              <a href="#how" className="text-sm border-b border-foreground pb-1 hover:text-accent hover:border-accent transition-colors">
                How it works
              </a>
            </div>
          </div>
          <div className="relative">
            <img
              src={heroImage}
              alt="A woman in a tan trench coat against a cream backdrop"
              width={1080}
              height={1920}
              className="w-full aspect-[3/4] object-cover"
            />
            <div className="absolute -bottom-6 -left-6 bg-background border border-border p-6 max-w-xs hidden md:block">
              <p className="eyebrow">The thesis</p>
              <p className="mt-2 font-serif text-lg leading-snug italic">
                "Personal style isn't bought — it's understood."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How */}
      <section id="how" className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <p className="eyebrow text-center">The Process</p>
          <h2 className="mt-4 text-4xl md:text-5xl text-center max-w-2xl mx-auto">
            Four considered steps to a wardrobe that fits.
          </h2>
          <div className="mt-20 grid grid-cols-1 md:grid-cols-4 gap-12">
            {[
              { n: "01", t: "Your measurements", d: "Share height, weight and a few preferences. We translate them into accurate size recommendations." },
              { n: "02", t: "A selfie, optional", d: "Upload a photo so the AI can read your undertone, hair and proportions." },
              { n: "03", t: "Name the occasion", d: "A first date, a board meeting, a weekend abroad — context shapes the brief." },
              { n: "04", t: "See it on you", d: "Three outfits, styling notes, and an AI rendering of how each one wears." },
            ].map((s) => (
              <div key={s.n}>
                <p className="font-serif text-3xl text-accent">{s.n}</p>
                <div className="hairline my-4" />
                <h3 className="text-xl font-serif">{s.t}</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-6 py-24 grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
          {[
            { t: "Multimodal analysis", d: "Upload selfies, clothing, or inspiration. The AI reads color, fit, formality, and texture together." },
            { t: "Size with confidence", d: "From your height and weight, get a tops, bottoms and a recommended band — never guess again." },
            { t: "Virtual try-on", d: "See an editorial rendering of each outfit on you before you spend a cent." },
          ].map((f) => (
            <div key={f.t} className="bg-background p-10">
              <h3 className="text-2xl font-serif">{f.t}</h3>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-28 text-center">
          <h2 className="text-5xl md:text-6xl font-serif">
            The next outfit<br />you wear with <em className="text-accent">conviction.</em>
          </h2>
          <Link
            to={user ? "/discover" : "/auth"}
            className="mt-10 inline-block bg-foreground text-background px-10 py-4 text-sm tracking-widest uppercase hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {user ? "Start styling" : "Create your account"}
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-10 flex flex-wrap justify-between items-center gap-4">
          <p className="font-serif text-lg">Style<span className="italic text-accent">AI</span></p>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} StyleAI. An editorial study in fit.</p>
        </div>
      </footer>
    </div>
  );
}
