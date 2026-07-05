"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";

//Assets
import notFound from "../../../public/not-found.png";

const ValidatePage = () => {
  const [data, setData] = useState(null); // { valid, status, certificate }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [id, setId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setId(params.get("id"));
  }, []);

  useEffect(() => {
    if (id === null) return; // wait until we've read the query string
    if (!id) {
      setError("No certificate ID provided.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/certificate/validate?id=${encodeURIComponent(id)}`);
        const body = await res.json();
        if (body?.certificate) {
          // Exists (active or revoked) — the API returns 410 for revoked but still sends the record.
          setData(body);
        } else {
          setError(body?.message || "Certificate not found.");
        }
      } catch {
        setError("Failed to fetch certificate data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-100">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
          <p>Verifying certificate…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col gap-6 items-center justify-center bg-gray-100 p-4 text-center">
        <Image src={notFound} alt="Not Found" width={100} height={100} />
        <div>
          <h1 className="text-xl font-black uppercase">Not verified</h1>
          <p className="mt-1 text-gray-600">{error || "No certificate found."}</p>
        </div>
      </div>
    );
  }

  const cert = data.certificate;
  const revoked = data.status === "revoked";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="flex flex-col md:flex-row bg-white rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full">
        {/* Left – certificate preview */}
        <div className="md:w-1/2 md:h-auto h-[38svh] flex items-center justify-center bg-gray-50 p-4">
          <iframe
            src={`${cert.documentUrl}#toolbar=0`}
            className="w-full h-full rounded-md"
            title="Certificate Preview"
          />
        </div>

        {/* Right – verification result */}
        <div className="md:w-1/2 flex flex-col justify-center p-6 py-10">
          {revoked ? (
            <Banner
              tone="red"
              title="Certificate Revoked"
              subtitle="This certificate is no longer valid."
            />
          ) : (
            <Banner
              tone="green"
              title="Certificate Verified"
              subtitle="This is an authentic Onlybees certificate."
            />
          )}

          <dl className="mt-6 space-y-3 text-sm">
            <Row label="Name" value={cert.name} />
            <Row label="Certificate" value={cert.certType} />
            <Row label="Issued By" value="Onlybees" />
            <Row label="Issue Date" value={new Date(cert.issueDate).toLocaleDateString()} />
            <Row label="Certificate ID" value={cert.certId} mono />
            {revoked && cert.revokeReason && (
              <Row label="Reason" value={cert.revokeReason} />
            )}
            {revoked && cert.revokedAt && (
              <Row label="Revoked On" value={new Date(cert.revokedAt).toLocaleDateString()} />
            )}
          </dl>

          {cert.fileHash && (
            <p className="mt-4 break-all text-[11px] text-gray-400">
              SHA-256 · {cert.fileHash}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={cert.documentUrl}
              target="_blank"
              rel="noreferrer"
              download
              className={`flex-1 rounded-lg px-4 py-2.5 text-center font-semibold text-white ${
                revoked ? "bg-gray-400" : "bg-black"
              }`}
            >
              Download Certificate
            </a>
            {cert.qrCodeUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cert.qrCodeUrl}
                alt="Verification QR"
                className="h-11 w-11 self-center rounded-md border border-gray-200"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function Banner({ tone, title, subtitle }) {
  const styles =
    tone === "green"
      ? { ring: "bg-green-100", dot: "text-green-600", heading: "text-green-700" }
      : { ring: "bg-red-100", dot: "text-red-600", heading: "text-red-700" };
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-11 w-11 place-items-center rounded-full ${styles.ring}`}>
        {tone === "green" ? (
          <svg className={`h-6 w-6 ${styles.dot}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg className={`h-6 w-6 ${styles.dot}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div>
        <h1 className={`text-xl font-black uppercase leading-tight ${styles.heading}`}>{title}</h1>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-right font-medium text-black ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

export default ValidatePage;
