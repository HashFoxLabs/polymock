export default function Footer() {
  return (
    <footer className="bg-black border-t border-gray-800 py-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div>
            <h4 className="text-orange-500 font-bold mb-4 text-lg">HashFox Labs</h4>
            <p className="text-gray-400 text-sm mb-4 leading-relaxed">
              Building tools for backtesting and paper trading across markets.
            </p>
            <div className="flex gap-4">
              <a
                href="https://x.com/polymockxyz"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-orange-500 transition-colors text-sm"
              >
                Twitter
              </a>
              <a
                href="https://t.me/+nxDZ0dMya1NhMDlk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-orange-500 transition-colors text-sm"
              >
                Telegram
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4 text-sm">Products</h4>
            <a
              href="https://polymock.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gray-400 hover:text-orange-500 transition-colors mb-2 text-sm"
            >
              Polymock
            </a>
            <a
              href="https://blockberg.vercel.app/terminal"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gray-400 hover:text-orange-500 transition-colors text-sm"
            >
              Blockberg
            </a>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4 text-sm">Community</h4>
            <a
              href="https://t.me/+nxDZ0dMya1NhMDlk"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gray-400 hover:text-orange-500 transition-colors mb-2 text-sm"
            >
              Telegram
            </a>
            <a
              href="https://x.com/polymockxyz"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gray-400 hover:text-orange-500 transition-colors mb-2 text-sm"
            >
              Twitter
            </a>
            <a
              href="https://github.com/PolyMock"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gray-400 hover:text-orange-500 transition-colors text-sm"
            >
              GitHub
            </a>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4 text-sm">Legal</h4>
            <a
              href="#"
              className="block text-gray-400 hover:text-orange-500 transition-colors mb-2 text-sm"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="block text-gray-400 hover:text-orange-500 transition-colors text-sm"
            >
              Terms of Service
            </a>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-800 text-center">
          <p className="text-gray-600 text-sm">
            © 2025 HashFox Labs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
