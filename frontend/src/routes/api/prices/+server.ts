import { json } from '@sveltejs/kit';
import type { RequestHandler } from '../../prices/$types';

const SYMBOLS = 'AAPL,TSLA,NVDA,MSFT,SPY,EUR/USD,USD/JPY,XAU/USD';
const API_KEY = import.meta.env.VITE_TWELVE_DATA_API_KEY;

let cachedPrices: Record<string, unknown> = {};
let lastFetch = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

async function fetchPrices() {
  const url = `https://api.twelvedata.com/price?symbol=${SYMBOLS}&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  cachedPrices = data;
  lastFetch = Date.now();
}

export const GET: RequestHandler = async () => {
  const now = Date.now();
  if (now - lastFetch > CACHE_DURATION) {
    await fetchPrices();
  }
  return json(cachedPrices);
};