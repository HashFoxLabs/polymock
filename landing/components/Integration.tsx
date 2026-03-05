"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function Integration() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Visual/Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="glass-card p-2 rounded-2xl overflow-hidden">
              <Image
                src="/images/example.png"
                alt="Multi-Platform Integration"
                width={800}
                height={600}
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
          </motion.div>

          {/* Right side - Text */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-orange-500">
              Multi-Platform Integration
            </h2>
            <div className="inline-block bg-yellow-500/20 px-4 py-2 rounded-full border border-yellow-400/30 mb-4">
              <span className="text-yellow-400 font-medium text-sm">In Development</span>
            </div>
            <p className="text-lg lg:text-xl text-gray-300 leading-relaxed text-justify">
              We&apos;re building a unified platform to paper-trade across all markets: crypto, prediction markets, forex, and stocks, with one single balance. Trade everything from one place.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
