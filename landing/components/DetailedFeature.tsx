"use client";


import { motion } from "framer-motion";

export default function DetailedFeature() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Text */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="lg:pr-8"
          >
            <h2 className="text-3xl lg:text-4xl font-bold mb-6 text-white leading-tight">
              Access to advanced backtesting with Risk Management
            </h2>
            <p className="text-lg lg:text-xl text-gray-300 leading-relaxed text-justify">
              Every strategy is stress-tested across historical market data before execution. Understand win rates, drawdowns, and expected returns in a zero-risk environment.
            </p>
          </motion.div>

          {/* Right side - Animated GIF */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="flex justify-center items-center overflow-hidden rounded-2xl ml-auto mr-8"
            style={{ width: 400, height: 400 }}
          >
            <video
              src="/hashfox.mp4"
              autoPlay
              loop
              muted
              playsInline
              width={400}
              height={400}
              className="max-w-full h-auto mix-blend-screen scale-110 brightness-125 saturate-150"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
