"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function FeatureCards() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Card 1 - Universal Data Aggregation */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="screenshot !bg-black p-8 rounded-2xl flex flex-col border border-orange-500/20"
          >
            <div className="mb-4 w-32 h-32 mx-auto">
              <Image
                src="/images/fox-data.png"
                alt="Fox Data"
                width={128}
                height={128}
                className="w-full h-full object-contain"
              />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4 text-center">
              Universal Data Aggregation
            </h3>
            <p className="text-base text-gray-400 leading-relaxed mb-6 text-center">
              We aggregate historical data across all markets: crypto, prediction markets, forex, and stocks, into one unified platform.
            </p>

            <div className="mt-auto bg-black/40 rounded-xl p-4 border border-orange-500/20">
              <div className="space-y-3">
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 w-24">Crypto</span>
                  <span className="text-sm text-green-400 font-mono">BTC, ETH, SOL...</span>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 w-24">Prediction</span>
                  <span className="text-sm text-orange-400 font-mono">Polymarket</span>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 w-24">Forex</span>
                  <span className="text-sm text-blue-400 font-mono">EUR/USD, GBP...</span>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 w-24">Stocks</span>
                  <span className="text-sm text-purple-400 font-mono">S&P 500, NASDAQ...</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 2 - Live Paper Trading */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="screenshot !bg-black p-8 rounded-2xl flex flex-col border border-orange-500/20"
          >
            <div className="mb-4 w-32 h-32 mx-auto">
              <Image
                src="/images/fox-trading.png"
                alt="Fox Trading"
                width={128}
                height={128}
                className="w-full h-full object-contain"
              />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4 text-center">
              Live Paper Trading
            </h3>
            <p className="text-base text-gray-400 leading-relaxed mb-6 text-center">
              Trade on real-time live data with zero risk. Test your strategies against live market conditions before committing real capital.
            </p>

            <div className="mt-auto bg-black/60 rounded-xl p-4 border border-blue-500/20">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-green-500/10 rounded">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-xs text-white font-mono">LIVE</span>
                  </div>
                  <span className="text-xs text-green-400">Connected</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Paper Balance</span>
                  <span className="text-sm text-white font-mono">$100,000</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Open Positions</span>
                  <span className="text-sm text-orange-400 font-mono">3 active</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">P&L Today</span>
                  <span className="text-sm text-green-400 font-mono">+$2,340</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 3 - Precision Backtesting */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            className="screenshot !bg-black p-8 rounded-2xl flex flex-col border border-orange-500/20"
          >
            <div className="mb-4 w-32 h-32 mx-auto">
              <Image
                src="/images/fox-win.png"
                alt="Fox Win"
                width={128}
                height={128}
                className="w-full h-full object-contain"
              />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4 text-center">
              Precision Backtesting
            </h3>
            <p className="text-base text-gray-400 leading-relaxed mb-6 text-center">
              Backtest with precision on historical data using your strategies. Every entry, exit, stop-loss, and return is statistically validated.
            </p>

            <div className="mt-auto bg-black/40 rounded-xl p-4 border border-teal-500/20">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Win Rate</span>
                  <span className="text-sm text-green-400 font-mono">68.4%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Sharpe Ratio</span>
                  <span className="text-sm text-orange-400 font-mono">1.87</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Max Drawdown</span>
                  <span className="text-sm text-red-400 font-mono">-12.3%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Risk-Reward</span>
                  <span className="text-sm text-white font-mono">1:2.45</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
