"use client";

import React, { useState } from "react";

export default function Home() {
  const [id, setId] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const trimmed = id.trim();
    if (trimmed) window.location.href = `/validate?id=${encodeURIComponent(trimmed)}`;
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-black uppercase tracking-tight">Verify a certificate</h1>
        <p className="mt-2 text-sm text-gray-500">
          Enter a certificate ID or scan the QR code on your certificate to confirm its authenticity.
        </p>
        <form onSubmit={submit} className="mt-6 flex gap-2">
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="OB-2026-XXXXXXXXXXXX"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-black"
          />
          <button
            type="submit"
            disabled={!id.trim()}
            className="rounded-lg bg-black px-5 py-2.5 font-semibold text-white disabled:opacity-40"
          >
            Verify
          </button>
        </form>
      </div>
    </div>
  );
}
