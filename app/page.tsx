import { redirect } from "next/navigation";

// Keep the redirect response dynamic so its Location header is sent on every request.
export const dynamic = "force-dynamic";

export default function Home() {
  redirect("/sign-in");
}
