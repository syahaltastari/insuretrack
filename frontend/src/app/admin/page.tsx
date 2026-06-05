import { redirect } from "next/navigation";
import { headers } from "next/headers";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

/**
 * /admin index — server-side redirect.
 *
 * Reads the auth token from a cookie if available. Client-side `localStorage`
 * tokens are not visible here, so unauthenticated visitors may still flash
 * the redirect-to-login client side via the AdminShell guard; the page itself
 * is a fast server-side redirect to the canonical /admin/login.
 */
export default function AdminIndex() {
  // We can't read localStorage on the server. Default to /admin/login.
  // AdminShell in the destination page will then bounce to /admin/dashboard
  // if a valid token is found in localStorage.
  redirect("/admin/login");
}
