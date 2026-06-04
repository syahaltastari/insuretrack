import { redirect } from "next/navigation";

/**
 * /portal index — server-side redirect to login.
 * PortalShell in the destination page will then bounce to /portal/dashboard
 * if a valid customer token is found in localStorage.
 */
export default function PortalIndex() {
  redirect("/portal/login");
}
