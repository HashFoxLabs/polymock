import Link from "next/link";
import SiteNav from "@/components/landing/SiteNav";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <>
      <div id="bubble-container" />
      <div id="three-container" />
      <div className="noise-overlay" />
      <div className="grain-overlay" />

      <SiteNav />

      <section id="hero-section">
        <div id="apps-section" aria-hidden style={{ height: 0, overflow: "hidden" }} />
        <div className="hero-content">
          <div className="hero-badge">From practice to live Execution</div>
          <h1 className="hero-title">
            Learn Any Market,
            <br />
            Without Risk
          </h1>
          <p className="hero-sub">
            Where traders prove their edge and build a reputation without risking
            capital. Simulate strategies across crypto and prediction markets, climb the onchain
            leaderboard, and let your track record speak for itself
          </p>
          <div className="hero-actions">
            <a href="https://polymock.app/" target="_blank" rel="noreferrer" className="btn-primary">
              Start Paper Trading →
            </a>
            <Link href="/community" className="btn-ghost-hero">
              Community Hub
            </Link>
          </div>
        </div>
        <div className="scroll-hint">
          <div>Scroll to explore</div>
          <div className="scroll-arrow">↓</div>
        </div>
      </section>

      <section id="everything-section">
        <div className="everything-content">
          <div className="everything-img-wrap reveal-scale">
            <img src="/backtest.png" alt="Backtest Dashboard" className="everything-img" />
          </div>
        </div>
        <div id="chart-ui" style={{ display: "none" }}>
          <div id="morph-name" />
          <div id="morph-counter" />
          <div id="morph-progress" />
        </div>
      </section>

      <section id="platform-section">
        <div className="platform-grid">
          <div className="platform-left reveal-left">
            <div className="platform-label">The Platform</div>
            <h2 className="platform-heading">
              Learn and compet,
              <br />
              <em>risk free</em>
            </h2>
            <p className="platform-text">
              Learn, test, and compete in real market conditions. With real-time data and onchain
              execution, your simulation history becomes a verifiable track record. Rank up against
              other traders, share your edge, and prove your profitability to the world
            </p>
          </div>
          <div className="platform-right stagger-children">
            <div className="platform-stat reveal">
              <img src="/solana.png" className="platform-logo" alt="Solana" />
              <div className="platform-stat-value orange">Solana</div>
              <div className="platform-stat-label">On-Chain Execution</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/synthesis.png" className="platform-logo synthesis-logo" alt="Synthesis" />
              <div className="platform-stat-value orange">Synthesis</div>
              <div className="platform-stat-label">Prediction Markets</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/pyth.png" className="platform-logo" alt="Pyth" />
              <div className="platform-stat-value orange">Pyth</div>
              <div className="platform-stat-label">Crypto Price Data</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/magicblock.png" className="platform-logo" alt="MagicBlock" />
              <div className="platform-stat-value orange">MagicBlock</div>
              <div className="platform-stat-label">Instant Execution</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/trading-view.png" className="platform-logo" alt="TradingView" />
              <div className="platform-stat-value orange">TradingView</div>
              <div className="platform-stat-label">Pro Charts</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/twelve.png" className="platform-logo" alt="Twelve Data" />
              <div className="platform-stat-value orange">Twelve Data</div>
              <div className="platform-stat-label">Forex &amp; Stocks</div>
            </div>
          </div>
        </div>
      </section>

      <section id="paper-trading-section" className="how-section-standalone">
        <div className="section-inner">
          <div className="section-header reveal">
            <h2 className="paper-title">What is Paper Trading?</h2>
            <p
              className="hero-sub"
              style={{ animation: "none", marginBottom: "1rem" }}
            >
              Paper trading allows you to simulate real trading with virtual money. It&apos;s the
              perfect way to test strategies, learn market dynamics, and build confidence before
              risking actual capital.
            </p>
            <p className="hero-sub" style={{ animation: "none", marginBottom: 0 }}>
              Our platform provides real-time market data from prediction markets and crypto
              exchanges, giving you an authentic trading experience without the financial risk.
            </p>
          </div>
          <div className="paper-chart-wrap reveal">
            <img src="/blockberg.png" alt="Blockberg Trading Platform" className="paper-chart-img" />
          </div>

          <div className="section-header reveal" style={{ marginTop: 80 }}>
            <div className="section-badge">Live from the Community</div>
            <h2 className="section-title gradient-text">Community Hub</h2>
            <p
              className="hero-sub"
              style={{
                animation: "none",
                marginBottom: 0,
                maxWidth: 640,
                marginInline: "auto",
              }}
            >
              Share your paper trades and backtested strategies, comment on others&apos; results, and
              learn from real traders in real time.
            </p>
          </div>
          <div className="community-grid reveal" id="community-grid">
            <div className="comm-card skeleton" />
            <div className="comm-card skeleton" />
            <div className="comm-card skeleton" />
          </div>
          <div className="reveal" style={{ textAlign: "center", marginTop: "2rem" }}>
            <Link href="/community" className="btn-primary small">
              View All Posts →
            </Link>
          </div>
        </div>
      </section>

      <section id="how-section" className="how-section-standalone grid-bg">
        <div className="how-two-col section-inner">
          <div className="how-left">
            <div className="how-header">
              <h2 className="section-title orange">How It Works</h2>
            </div>
            <div className="steps">
              <div className="step">
                <div className="step-num">1</div>
                <div>
                  <h4>Create an Account</h4>
                  <p>
                    Sign up for free and get instant access to paper trading and backtesting tools
                    across all markets.
                  </p>
                </div>
              </div>
              <div className="step">
                <div className="step-num">2</div>
                <div>
                  <h4>Pick a Market</h4>
                  <p>
                    Choose from crypto, prediction markets, forex, or stocks, all available on a
                    single platform.
                  </p>
                </div>
              </div>
              <div className="step">
                <div className="step-num">3</div>
                <div>
                  <h4>Paper Trade or Backtest</h4>
                  <p>
                    Trade on live data with zero risk, or backtest your strategies on historical data
                    with advanced parameters.
                  </p>
                </div>
              </div>
              <div className="step">
                <div className="step-num">4</div>
                <div>
                  <h4>Analyze &amp; Optimize</h4>
                  <p>
                    Review win rates, drawdowns, and risk-reward ratios to refine your strategy
                    before committing real capital.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="how-right">
            <canvas id="gear-canvas" />
          </div>
        </div>
      </section>

      <section id="blob-platform-section">
        <canvas id="blob-canvas" />
        <div className="mp-text reveal">
          <div className="mp-badge">Coming Soon</div>
          <h2 className="mp-title">The Unified Live Terminal</h2>
          <p className="mp-sub">
            We are bringing real-money execution to the platform. Soon, you will be able to trade
            crypto, forex, and prediction markets with real capital. Take your proven onchain track
            record and flip to live trading, directly from the same dashboard.
          </p>
        </div>
      </section>

      <div id="content">
        <section id="faq-section" className="content-section">
          <div className="section-inner">
            <div className="section-header reveal faq-section-header">
              <h2 className="faq-heading">Frequently Asked Questions</h2>
              <p className="faq-subtitle">Everything you need to know about us</p>
            </div>
            <div className="faq-list">
              <details>
                <summary>What is HashFox Labs?</summary>
                <div className="faq-answer">
                  HashFox Labs started as a product studio: we built trading and DeFi software for
                  clients and side experiments. Today most of our effort goes into our own trading
                  sandbox—paper trading and backtesting across prediction markets, crypto, forex, and
                  stocks, with execution anchored on Solana. We still take on select client work and
                  occasionally ship standalone tools or hackathon builds, but that sandbox is the core
                  of what we do now.
                </div>
              </details>
              <details>
                <summary>Is it free to use?</summary>
                <div className="faq-answer">
                  Core paper trading and onboarding are free. The backtest engine will use credits for
                  heavy or high-volume runs. Optional prizepools: we take 3% of the pool; the rest goes
                  to players. Premium add-ons may appear later—you can still explore plenty for free.
                </div>
              </details>
              <details>
                <summary>Do I need to connect a wallet?</summary>
                <div className="faq-answer">
                  On-chain paper trading needs a Solana address: use a browser wallet (e.g. Phantom,
                  Solflare) or quick login with an embedded wallet. Balances stay in on-chain PDAs
                  either way. Backtesting on historical data needs no wallet or sign-in.
                </div>
              </details>
              <details>
                <summary>What data sources do you use?</summary>
                <div className="faq-answer">
                  Prediction markets: Synthesis for live data; backtests use our historical datasets.
                  Crypto: Pyth and TradingView. Forex, stocks, commodities: Twelve Data.
                </div>
              </details>
              <details>
                <summary>Can I test my own trading strategies?</summary>
                <div className="faq-answer">
                  Yes. Today you build strategies as rules: when to enter and exit, how size positions,
                  and basic risk settings (stops, limits, exposure). You run them against historical data
                  in the backtester or forward-test in paper trading, then iterate. We&apos;re building
                  v3 so you can describe what you want in natural language—our engine will translate
                  that into executable logic— but rule-based authoring remains the foundation.
                </div>
              </details>
              <details>
                <summary>What is the main goal?</summary>
                <div className="faq-answer">
                  Our vision is a single sandbox where you can backtest and paper trade crypto,
                  prediction markets, forex, and stocks in one place, with one balance across every
                  market, before you risk real capital. When you are ready, we plan to offer a live
                  trading platform so you can deploy the same ideas with real money after you have
                  proven them in the sandbox.
                </div>
              </details>
            </div>
          </div>
        </section>

        <section className="content-section cta-bg" id="final-section">
          <div
            className="section-inner"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 0,
            }}
          >
            <h2 className="paper-title reveal" style={{ marginBottom: "1rem" }}>
              Wear the <span style={{ color: "var(--orange)" }}>HashFox</span> Mask
              <br />
              <span
                style={{
                  fontSize: "0.65em",
                  background: "linear-gradient(to right,#f97316,#ffffff)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Join the Community
              </span>
            </h2>
            <p
              className="section-sub reveal"
              style={{ maxWidth: 640, marginBottom: "2.5rem", color: "#ffffff" }}
            >
              Step into the arena. Connect with traders, share strategies and give feedback.
            </p>
            <canvas
              id="fox-canvas"
              className="reveal"
              style={{
                width: "100%",
                maxWidth: 520,
                height: 420,
                display: "block",
                cursor: "grab",
                borderRadius: 16,
                marginBottom: "2.5rem",
              }}
            />
            <div className="cta-actions reveal">
              <a href="https://discord.gg/W4c3Sep5Qq" target="_blank" rel="noreferrer" className="btn-ghost large">
                Discord
              </a>
              <Link href="/community" className="btn-primary large">
                Community Hub
              </Link>
              <a
                href="https://t.me/hashfoxcommunity"
                target="_blank"
                rel="noreferrer"
                className="btn-ghost large"
              >
                Telegram
              </a>
            </div>
          </div>
        </section>

        <LandingFooter />
      </div>
    </>
  );
}
