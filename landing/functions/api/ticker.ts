interface Env {
  TWELVE_DATA_API_KEY: string;
}

const SYMBOLS = [
  { symbol: "BTC/USD", type: "crypto" },
  { symbol: "ETH/USD", type: "crypto" },
  { symbol: "EUR/USD", type: "forex" },
  { symbol: "GBP/USD", type: "forex" },
  { symbol: "AAPL", type: "stock" },
  { symbol: "TSLA", type: "stock" },
  { symbol: "XAU/USD", type: "commodity" },
  { symbol: "XAG/USD", type: "commodity" },
];

const DISPLAY_NAMES: Record<string, string> = {
  "BTC/USD": "BTC",
  "ETH/USD": "ETH",
  "EUR/USD": "EUR/USD",
  "GBP/USD": "GBP/USD",
  "AAPL": "AAPL",
  "TSLA": "TSLA",
  "XAU/USD": "GOLD",
  "XAG/USD": "SILVER",
};

const LOGOS: Record<string, string> = {
  "BTC/USD": "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  "ETH/USD": "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  "EUR/USD": "https://flagcdn.com/24x18/eu.png",
  "GBP/USD": "https://flagcdn.com/24x18/gb.png",
  "AAPL": "/images/logo/apple.png",
  "TSLA": "/images/logo/telsa.jpg",
  "XAU/USD": "",
  "XAG/USD": "",
};

export async function onRequest(context: { env: Env }) {
  const apiKey = context.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const symbolList = SYMBOLS.map((s) => s.symbol).join(",");
    const response = await fetch(
      `https://api.twelvedata.com/quote?symbol=${symbolList}&apikey=${apiKey}`
    );
    const data = await response.json() as Record<string, any>;

    const tickerItems = [];

    for (const item of SYMBOLS) {
      const quote = data[item.symbol] || data;
      if (quote && quote.close) {
        const price = parseFloat(quote.close);
        const change = parseFloat(quote.percent_change || "0");

        tickerItems.push({
          symbol: item.symbol,
          displayName: DISPLAY_NAMES[item.symbol] || item.symbol,
          price:
            price >= 1000
              ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : price >= 1
              ? `$${price.toFixed(2)}`
              : `$${price.toFixed(4)}`,
          change: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
          up: change >= 0,
          type: item.type,
          logo: LOGOS[item.symbol] || "",
        });
      }
    }

    return new Response(JSON.stringify(tickerItems), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch ticker data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
