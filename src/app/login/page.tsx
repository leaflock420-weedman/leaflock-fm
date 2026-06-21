import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/admin");
  const params = await searchParams;

  return (
    <main className="auth-page">
      <form className="auth-panel" action="/api/auth/login" method="post">
        <p className="eyebrow">Admin login</p>
        <h1>LeafLock desk</h1>
        <p className="form-note">Use the seeded admin account from your environment settings.</p>
        {params.error ? <p className="label">Login failed</p> : null}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="primary-button" type="submit">Sign in</button>
        <a className="mini-link" href="/">Back to station</a>
      </form>
      <ThemeToggle className="floating" />
    </main>
  );
}
