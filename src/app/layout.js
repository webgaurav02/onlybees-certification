import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Image from "next/image";


//Assets
import logo from '../../public/Logo/black.png'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Onlybees",
  description: "Join Onlybees to explore and amplify your creative vision with our dedicated team of strategists, designers, and developers. Onlybees fosters creativity by building effective engagement strategies for music and art enthusiasts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* <Image 
          src={logo}
          alt="Onlybees Logo"
          width='0'
          height='0'
          sizes="100vw"
          className="md:w-[15svw] w-[40svw] fixed top-10 left-10"
        /> */}
        {children}
      </body>
    </html>
  );
}
