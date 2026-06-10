import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — StyleAI" },
      { name: "description", content: "Create your StyleAI account to start styling." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            data: { full_name: name || email },
          },
        });
        if (error) throw error;
        toast.success("Account created — check your email if confirmation is required.");
        const { data: s } = await supabase.auth.getSession();
        if (s.session) navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/dashboard",
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-secondary/50 border-r border-border">
        <Link to="/" className="font-serif text-2xl">Style<span className="italic text-accent">AI</span></Link>
        <div>
          <p className="eyebrow">Members</p>
          <p className="mt-4 font-serif text-4xl leading-tight max-w-md">
            "A wardrobe edited by a stylist who knows you — that is the quiet luxury."
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© StyleAI Atelier</p>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <p className="eyebrow">{mode === "signin" ? "Welcome back" : "Begin"}</p>
          <h1 className="mt-2 text-4xl font-serif">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>

          <button
            onClick={onGoogle}
            disabled={busy}
            className="mt-8 w-full border border-foreground px-4 py-3 text-sm flex items-center justify-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50"
          >
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="hairline flex-1" /> or email <div className="hairline flex-1" />
          </div>

          <form onSubmit={onEmail} className="space-y-3">
            {mode === "signup" && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-transparent border border-input px-4 py-3 text-sm focus:outline-none focus:border-foreground"
              />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-transparent border border-input px-4 py-3 text-sm focus:outline-none focus:border-foreground"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-transparent border border-input px-4 py-3 text-sm focus:outline-none focus:border-foreground"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-foreground text-background py-3 text-sm tracking-wider uppercase hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground">
            {mode === "signin" ? "New here?" : "Already a member?"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-foreground border-b border-foreground hover:text-accent hover:border-accent"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
