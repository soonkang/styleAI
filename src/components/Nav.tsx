import { Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function Nav({ authed }: { authed: boolean }) {
  const router = useRouter();
  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.navigate({ to: "/" });
  }
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link to="/" className="font-serif text-xl tracking-tight">
          My<span className="italic text-accent">Style</span>
        </Link>
        <nav className="hidden md:flex gap-8 text-sm">
          {authed ? (
            <>
              <Link to="/dashboard" className="hover:text-accent transition-colors">Atelier</Link>
              <Link to="/discover" className="hover:text-accent transition-colors">Discover</Link>
              <Link to="/wardrobe" className="hover:text-accent transition-colors">Wardrobe</Link>
              <Link to="/profile" className="hover:text-accent transition-colors">Profile</Link>
            </>
          ) : (
            <>
              <a href="/#how" className="hover:text-accent transition-colors">How it works</a>
              <a href="/#features" className="hover:text-accent transition-colors">Features</a>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {authed ? (
            <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground">
              Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              className="text-sm border border-foreground px-4 py-2 hover:bg-foreground hover:text-background transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
