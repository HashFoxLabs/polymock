"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function CustomProduct() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          id="custom-product-section"
          className="p-8 lg:p-12 text-center scroll-mt-96"
        >
          <h3 className="text-2xl lg:text-3xl font-bold text-white mb-4">
            Need a Custom Product?
          </h3>
          <p className="text-gray-300 max-w-3xl mx-auto mb-4 text-lg text-center">
            We build specialized trading and DeFi products across various ecosystems: lending protocols, AI integrations, on-chain analytics, automated strategies, and more.
          </p>
          <p className="text-gray-400 max-w-3xl mx-auto mb-8 text-base text-center">
            With experience shipping multiple products at hackathons and in production, we move fast and deliver. Whether you need a DeFi protocol, an AI-powered tool, or a custom smart contract solution, we can build it for you.
          </p>
          <button
            onClick={() => window.open("https://cal.com/hashfoxlabs", "_blank")}
            className="bg-orange-500 hover:bg-orange-600 px-8 py-3 rounded-full font-semibold text-black hover:scale-105 transition-all text-lg"
          >
            Book a Call
          </button>
        </motion.div>

        {/* Hackathon Projects */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mt-8 grid grid-cols-2 gap-4"
        >
          <div className="glass-card p-2 rounded-2xl aspect-video overflow-hidden">
            <Image
              src="/images/hedera.png"
              alt="Hedera"
              width={600}
              height={300}
              className="w-full h-full object-cover rounded-xl hover:scale-[1.01] transition-transform duration-300"
            />
          </div>
          <div className="glass-card p-2 rounded-2xl aspect-video overflow-hidden">
            <Image
              src="/images/stackable.png"
              alt="Stackable"
              width={600}
              height={300}
              className="w-full h-full object-cover rounded-xl hover:scale-[1.01] transition-transform duration-300"
            />
          </div>
          <div className="glass-card p-2 rounded-2xl aspect-video overflow-hidden">
            <Image
              src="/images/zkfied.png"
              alt="ZKfied"
              width={600}
              height={300}
              className="w-full h-full object-cover rounded-xl hover:scale-[1.01] transition-transform duration-300"
            />
          </div>
          <div className="glass-card p-2 rounded-2xl aspect-video overflow-hidden">
            <Image
              src="/images/atom.png"
              alt="Atom"
              width={600}
              height={300}
              className="w-full h-full object-cover rounded-xl hover:scale-[1.01] transition-transform duration-300"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
