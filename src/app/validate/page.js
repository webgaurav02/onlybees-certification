"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from 'next/navigation'
import Image from "next/image";

//Assets
import notFound from '../../../public/not-found.png'

const ValidatePage = () => {
  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  useEffect(() => {

    if (!id) return;

    const fetchCertificate = async () => {
      try {
        // Replace the URL with your actual API endpoint
        const response = await fetch(`/api/certificate/validate?id=${id}`);
        const data = await response.json();

        if (response.ok) {
          setCertificate(data.certificate);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError("Failed to fetch certificate data.");
      } finally {
        setLoading(false);
      }
    };

    fetchCertificate();
  }, [id]); // Empty dependency array to run the effect only once

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col  gap-6 items-center justify-center bg-gray-100">
         <Image 
          src={notFound}
          alt="Not Found"
          width={100}
          height={100}
        />
        <p>{error}</p>
      </div>
    );
  }

  if (!certificate) {
    return (
      <div className="min-h-screen flex flex-col gap-6  items-center justify-center bg-gray-100">
        <Image 
          src={notFound}
          alt="Not Found"
          width={100}
          height={100}
        />
        <p>No certificate found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="flex flex-col md:flex-row bg-white rounded-lg shadow-2xl overflow-hidden max-w-4xl w-full">
        {/* Left Side - Certificate Preview */}
        <div className="md:w-1/2 md:h-auto h-[30svh] flex items-center justify-center p-4">
          <iframe
            src={certificate.documentUrl}
            className="w-full h-full md:h-full rounded-md"
            title="Certificate Preview"
          ></iframe>
        </div>

        {/* Right Side - Details */}
        <div className="md:w-1/2 flex flex-col justify-center p-6 py-12">
          <h1 className="text-2xl font-black text-black mb-4 uppercase">
            Certificate Verified
          </h1>
          <p className="text-lg mb-2">
            <strong>Name:</strong> {certificate.name}
          </p>
          <p className="text-lg mb-2">
            <strong>Certificate:</strong> {certificate.certType}
          </p>
          <p className="text-lg mb-2">
            <strong>Issued By:</strong> Onlybees
          </p>
          <p className="text-lg mb-4">
            <strong>Issue Date:</strong>{" "}
            {new Date(certificate.issueDate).toLocaleDateString()}
          </p>

          <div className="flex flex-col md:flex-row gap-4">
            <a
              href={certificate.documentUrl}
              download
              className="px-4 py-2 bg-black text-white rounded-md text-center"
            >
              Download Certificate
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValidatePage;
