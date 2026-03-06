import { Buffer } from 'buffer';

// Ensure Buffer is globally available in the browser
// Required by @solana/web3.js and Anchor
if (typeof globalThis.Buffer === 'undefined') {
	globalThis.Buffer = Buffer;
}
