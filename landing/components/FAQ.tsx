"use client";

import { motion } from "framer-motion";
import { useState } from "react";

const faqs = [
  {
    question: "What is HashFox Labs?",
    answer:
      "HashFox Labs is a product studio focused on building trading and DeFi products. We develop our own platforms like Polymock and Blockberg, build custom products for clients across various ecosystems, and regularly ship projects at hackathons.",
  },
  {
    question: "What is Polymock?",
    answer:
      "Polymock is our paper trading and backtesting platform for prediction markets. It uses historical data from Polymarket to let you test your market intuition and trading strategies in a zero-risk environment.",
  },
  {
    question: "What is Blockberg?",
    answer:
      "Blockberg is our paper trading and backtesting platform for crypto markets. Trade live crypto data with zero risk and backtest your strategies on historical market data across various crypto assets.",
  },
  {
    question: "Is it free to use?",
    answer:
      "Yes! Our core backtesting and paper trading features are free to use. You can also unlock premium features and participate in prizepool competitions to earn rewards while testing your skills against other traders.",
  },
  {
    question: "Do I need to connect a wallet?",
    answer:
      "A Solana wallet is required for on-chain paper trading, as your virtual balance is stored in PDA accounts on Solana. However, no wallet is needed for backtesting — you can test strategies on historical data without connecting anything.",
  },
  {
    question: "What data sources do you use?",
    answer:
      "We use Dome API and Polymarket API for prediction markets data, Pyth Network and TradingView for crypto assets, and Twelve Data for forex, stocks, and commodities.",
  },
  {
    question: "Can I test my own trading strategies?",
    answer:
      "Yes! You can currently define custom strategies with entry/exit rules and risk management parameters. We're also working on v3, where you'll simply describe your strategy in a prompt and our backtest engine paired with an LLM will handle the rest — generating, testing, and optimizing your strategy automatically.",
  },
  {
    question: "What is the main goal?",
    answer:
      "Our vision is to build a unified sandbox platform where you can backtest and paper-trade any market — crypto, prediction markets, forex, stocks — all in one place before going live. One platform, one balance, every market.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq-section" className="py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-orange-500">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-gray-400">
            Everything you need to know about HashFox Labs
          </p>
        </motion.div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              viewport={{ once: true }}
              className="bg-black rounded-2xl border border-orange-500/20 overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 text-left flex justify-between items-center hover:bg-white/5 transition-colors"
              >
                <span className="text-lg font-semibold text-white pr-8">
                  {faq.question}
                </span>
                <span
                  className={`text-orange-500 text-2xl transition-transform duration-300 flex-shrink-0 ${
                    openIndex === index ? "rotate-180" : ""
                  }`}
                >
                  ↓
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? "max-h-96" : "max-h-0"
                }`}
              >
                <div className="px-6 pb-5 text-gray-400 leading-relaxed text-justify">
                  {faq.answer}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
