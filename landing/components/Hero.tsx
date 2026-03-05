"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center py-20 pt-[100px] px-6">
      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black pointer-events-none" />

      <div className="relative z-10 w-full max-w-6xl mx-auto">
        {/* Tagline Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex justify-center mb-8"
        >
          <div className="inline-block bg-orange-500/20 px-6 py-3 rounded-full backdrop-blur-md border border-orange-400/30">
            <span className="text-white font-medium text-sm">
              From protocol ideas to live products
            </span>
          </div>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-6 text-5xl md:text-6xl lg:text-7xl"
        >
          Engineering the Future
          <br />
          of Markets
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-xl md:text-2xl text-white mb-10 max-w-3xl mx-auto"
        >
          From prediction platforms to crypto ecosystems, we build the high-performance infrastructure for next-generation traders and developers
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <button
            onClick={() => window.open("https://polymock.app/", "_blank")}
            className="bg-orange-500 hover:bg-orange-600 px-8 py-3 rounded-full font-semibold text-black hover:scale-105 transition-all"
          >
            Start Paper Trading →
          </button>
          <button
            onClick={() => window.location.href = "/community"}
            className="glass-dark px-8 py-3 rounded-full font-semibold text-white border border-gray-600 hover:border-orange-500 hover:scale-105 hover:shadow-xl hover:shadow-orange-500/30 transition-all"
          >
            Community Hub
          </button>
        </motion.div>
      </div>

      {/* Featured Dashboard Image */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="relative z-10 w-full max-w-6xl mx-auto px-6"
      >
        <div className="glass-card rounded-2xl p-4">
          <Image
            src="/images/design-mode/blockberg.png"
            alt="Trading Dashboard"
            width={1200}
            height={700}
            className="screenshot w-full h-auto"
            priority
          />
        </div>
      </motion.div>
    </section>
  );
}
