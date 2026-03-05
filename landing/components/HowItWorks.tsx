"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const steps = [
  {
    number: 1,
    title: "Create an Account",
    description:
      "Sign up for free and get instant access to paper trading and backtesting tools across all markets.",
  },
  {
    number: 2,
    title: "Pick a Market",
    description:
      "Choose from crypto, prediction markets, forex, or stocks, all available on a single platform.",
  },
  {
    number: 3,
    title: "Paper Trade or Backtest",
    description:
      "Trade on live data with zero risk, or backtest your strategies on historical data with advanced parameters.",
  },
  {
    number: 4,
    title: "Analyze & Optimize",
    description:
      "Review win rates, drawdowns, and risk-reward ratios to refine your strategy before committing real capital.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 px-6 relative">
      {/* Matrix-style background pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(249, 115, 22, 0.1) 2px,
            rgba(249, 115, 22, 0.1) 4px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 2px,
            rgba(249, 115, 22, 0.1) 2px,
            rgba(249, 115, 22, 0.1) 4px
          )`
        }} />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header — full width above */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-orange-500">
            How It Works
          </h2>
          <p className="text-2xl lg:text-3xl text-orange-500">
            Four simple steps
          </p>
        </motion.div>

        {/* Content — text + image aligned */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left side */}
          <div className="flex flex-col">
            <p className="text-lg text-white mb-12 text-justify">
              Experience professional-grade backtesting and paper trading tools
              designed for both novice and experienced traders.
            </p>

            <motion.div
              className="space-y-8 flex-1"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.15, ease: "easeOut" },
                },
              }}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {steps.map((step, index) => (
                <motion.div
                  key={index}
                  variants={{
                    hidden: { x: -20, opacity: 0 },
                    visible: {
                      x: 0,
                      opacity: 1,
                      transition: { duration: 0.8, ease: "easeOut" },
                    },
                  }}
                  whileHover={{
                    x: 8,
                    transition: { duration: 0.3, ease: "easeOut" },
                  }}
                  className="flex items-start gap-6 cursor-pointer"
                >
                  <div className="flex-shrink-0">
                    <motion.div
                      className="w-14 h-14 rounded-2xl bg-black border border-orange-500/30 flex items-center justify-center"
                      whileHover={{
                        scale: 1.05,
                        backgroundColor: "rgba(249, 115, 22, 0.8)",
                        transition: { duration: 0.3, ease: "easeOut" },
                      }}
                    >
                      <span className="text-2xl font-bold text-white">
                        {step.number}
                      </span>
                    </motion.div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-gray-300 leading-relaxed text-justify">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Right side - Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="relative flex justify-center"
          >
            <div className="glass-card p-4 rounded-2xl max-w-sm">
              <Image
                src="/images/bitcoin.png"
                alt="Paper Trading Interface"
                width={400}
                height={800}
                className="w-full rounded-xl hover:scale-[1.01] transition-transform duration-300"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
