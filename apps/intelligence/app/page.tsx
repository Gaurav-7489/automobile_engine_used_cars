import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: { absolute: "VandLabs Automotive Intelligence: market evidence, stock and advertising for Indian dealerships" },
  description: "Know your stock. Understand the market. Decide with evidence. Market evidence, inventory operations and vehicle-specific advertising in one dealership workspace.",
};

export default function Home() {
  return <LandingPage />;
}
