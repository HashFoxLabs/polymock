"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function EverythingSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-block bg-orange-500/20 px-6 py-3 rounded-full backdrop-blur-md border border-orange-400/30 mb-6">
            <span className="text-white font-medium text-sm">
              Paper Trading & Backtesting
            </span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-orange-400 to-orange-600 bg-clip-text text-transparent">
            Everything You Need to Experiment Markets
          </h2>
          <p className="text-lg lg:text-xl text-white max-w-3xl mx-auto">
            The on-chain sandbox for modern traders. Paper-trade on live data and backtest on historical data, all verifiable on Solana.
          </p>
        </motion.div>

        {/* Large Dashboard Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <div className="glass-card p-4 rounded-2xl">
            <Image
              src="/images/backtest.png"
              alt="Dashboard Interface"
              width={1200}
              height={700}
              className="screenshot w-full h-auto"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
