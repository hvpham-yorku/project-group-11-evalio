"use client";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center text-center">
      <h1 className="text-4xl font-bold">Welcome to Evalio</h1>
      <Link
        href="/setup/upload"
        className="mt-6 bg-black text-white px-6 py-2 rounded"
      >
        Get Started
      </Link>
    </main>
  );
}
