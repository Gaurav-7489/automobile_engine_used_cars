import { redirect } from "next/navigation";

/** Retired public marketing page: access to the platform is by invitation, from the sign-in page. */
export default function Page() {
  redirect("/login");
}
