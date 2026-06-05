import { redirect } from "next/navigation";

// Skip static prerender — Next.js 15 + React 19 RC incompatibility.
export const dynamic = "force-dynamic";

/**
 * /portal index — server-side redirect to login.
 * PortalShell in the destination page will then bounce to /portal/dashboard
 * if a valid customer token is found in localStorage.
 */
export default function PortalIndex() {
  redirect("/portal/login");
}
