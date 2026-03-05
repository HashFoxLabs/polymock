"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function Header() {
  const [scrollY, setScrollY] = useState(0);
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Dynamic width calculation matching original site
  const getHeaderWidth = () => {
    if (typeof window !== "undefined") {
      const width = window.innerWidth;
      if (width >= 1024) {
        // Desktop
        return Math.max(650, 900 - scrollY);
      } else if (width >= 768) {
        // Tablet
        return Math.min(width - 64, 500);
      } else {
        // Mobile
        return Math.min(width - 32, 350);
      }
    }
    return 900;
  };

  return (
    <header
      className="fixed left-1/2 z-50 glass-dark rounded-full transition-all duration-300"
      style={{
        width: `${getHeaderWidth()}px`,
        transform: "translateX(-50%)",
        top: "0.5rem",
        minWidth: "350px",
      }}
    >
      <div className="flex justify-between items-center px-3 sm:px-6 py-2 sm:py-3">
        {isHome ? (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-0.5"
          >
            <div className="relative h-14 w-14 sm:h-16 sm:w-16">
              <Image
                src="/hashfoxlogo.png"
                alt="HashFox Labs Logo"
                fill
                className="object-contain scale-150"
              />
            </div>
            <span className="text-sm sm:text-xl text-white font-medium flex items-center h-14 sm:h-16">
              HashFox Labs
            </span>
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-0.5">
            <div className="relative h-14 w-14 sm:h-16 sm:w-16">
              <Image
                src="/hashfoxlogo.png"
                alt="HashFox Labs Logo"
                fill
                className="object-contain scale-150"
              />
            </div>
            <span className="text-sm sm:text-xl text-white font-medium flex items-center h-14 sm:h-16">
              HashFox Labs
            </span>
          </Link>
        )}

        <nav className="hidden md:flex items-center gap-4 lg:gap-8 h-14 sm:h-16">
          <button
            onClick={() => document.getElementById("custom-product-section")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm lg:text-base text-gray-300 hover:text-orange-500 transition-colors"
          >
            Custom
          </button>
          <button
            onClick={() => document.getElementById("faq-section")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm lg:text-base text-gray-300 hover:text-orange-500 transition-colors"
          >
            FAQ
          </button>
          <button
            className="text-sm lg:text-base text-gray-300 hover:text-orange-500 transition-colors cursor-default"
          >
            Docs
          </button>
        </nav>

        <button
          onClick={() => {
            const appsSection = document.getElementById("apps-section");
            appsSection?.scrollIntoView({ behavior: "smooth" });
          }}
          className="bg-orange-500 hover:bg-orange-600 text-black px-5 sm:px-6 py-2 sm:py-3 rounded-full font-medium transition-all text-sm"
        >
          <span className="hidden sm:inline">Launch Apps</span>
          <span className="sm:hidden">Launch</span>
        </button>
      </div>
    </header>
  );
}
