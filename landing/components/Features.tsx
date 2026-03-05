"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const mainApps = [
  {
    title: "Polymock",
    description:
      "Paper trading and backtesting for prediction markets. Test your market intuition with historical data from Polymarket.",
    link: "https://polymock.app/",
    linkText: "Open Polymock",
    badge: "Production",
    badgeColor: "bg-orange-500",
  },
  {
    title: "Blockberg",
    description:
      "Paper trading and backtesting for crypto markets. Test strategies on live and historical data across crypto assets.",
    link: "https://blockberg.vercel.app/terminal",
    linkText: "Open Blockberg",
    badge: "Production",
    badgeColor: "bg-orange-500",
  },
  {
    title: "MockRock",
    description:
      "Paper trading and backtesting for stocks and forex markets. Test strategies on traditional markets with real historical data.",
    link: "",
    linkText: "",
    badge: "In Development",
    badgeColor: "bg-yellow-500",
  },
];


export default function Features() {
  return (
    <section id="apps-section" className="pt-8 pb-20 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-block bg-orange-500/20 px-6 py-3 rounded-full backdrop-blur-md border border-orange-400/30 mb-6">
            <span className="text-white font-medium text-sm">HashFox Labs Ecosystem</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-orange-400 to-orange-600 bg-clip-text text-transparent">
            Our Apps
          </h2>
          <p className="text-xl md:text-2xl text-white max-w-3xl mx-auto">
            Production tools, hackathon experiments, and prototypes
          </p>
        </motion.div>

        {/* Main Apps - Production */}
        <div className="mb-12">
          <h3 className="text-2xl font-bold text-white mb-6">Ecosystem</h3>
          <div className="grid md:grid-cols-3 gap-6">
            {mainApps.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.08 }}
                viewport={{ once: true }}
                className="bg-black p-6 lg:p-8 relative overflow-hidden rounded-2xl border border-orange-500/20 flex flex-col"
              >
                <div className={`absolute top-4 right-4 ${item.badgeColor} text-white text-xs px-3 py-1 rounded-full font-medium`}>
                  {item.badge}
                </div>
                <h3 className="text-xl lg:text-2xl font-bold text-orange-500 mb-3 lg:mb-4">
                  {item.title}
                </h3>
                <p className="text-sm lg:text-base text-gray-400 leading-relaxed mb-4 flex-grow text-justify">
                  {item.description}
                </p>
                {item.link && (
                  <button
                    onClick={() => window.open(item.link, "_blank")}
                    className="bg-orange-500 hover:bg-orange-600 text-black px-6 py-2 rounded-full font-medium transition-all text-sm"
                  >
                    {item.linkText}
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </div>



      </div>
    </section>
  );
}
