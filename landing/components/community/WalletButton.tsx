"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { connectWeb3Auth, disconnectWeb3Auth, isWeb3AuthConnected, initWeb3Auth } from "@/lib/web3auth";
import UsernameModal from "./UsernameModal";

export interface ConnectedUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  walletAddress: string;
}

interface WalletButtonProps {
  onUserChange: (user: ConnectedUser | null) => void;
}

export default function WalletButton({ onUserChange }: WalletButtonProps) {
  const { publicKey, connected, select, disconnect, wallets, connecting } = useWallet();
  const [showConnectOptions, setShowConnectOptions] = useState(false);
  const [showWalletList, setShowWalletList] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [user, setUser] = useState<ConnectedUser | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [web3authConnecting, setWeb3authConnecting] = useState(false);
  const [isEmbeddedWallet, setIsEmbeddedWallet] = useState(false);
  // Store embedded wallet address separately (not from useWallet)
  const [embeddedPublicKey, setEmbeddedPublicKey] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const connectRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const lastLookedUp = useRef<string | null>(null);

  // The active wallet address (from classic wallet or embedded)
  const activeWalletAddress = isEmbeddedWallet ? embeddedPublicKey : publicKey?.toBase58() || null;
  const isConnected = isEmbeddedWallet ? !!embeddedPublicKey : connected;

  // Pre-init Web3Auth on mount
  useEffect(() => {
    initWeb3Auth();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (connectRef.current && !connectRef.current.contains(e.target as Node)) {
        setShowConnectOptions(false);
        setShowWalletList(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Lookup user in Supabase
  const lookupUser = useCallback(async (walletAddress: string) => {
    if (lastLookedUp.current === walletAddress && user) return;
    lastLookedUp.current = walletAddress;
    setLookingUp(true);

    const { data } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (data?.username) {
      const connectedUser: ConnectedUser = {
        userId: data.id,
        username: data.username,
        avatarUrl: data.avatar_url || null,
        walletAddress,
      };
      setUser(connectedUser);
      onUserChange(connectedUser);
    } else {
      setShowUsernameModal(true);
    }
    setLookingUp(false);
  }, [onUserChange, user]);

  // When classic wallet connects, look up user
  useEffect(() => {
    if (connected && publicKey && !isEmbeddedWallet) {
      lookupUser(publicKey.toBase58());
    } else if (!connected && !isEmbeddedWallet) {
      setUser(null);
      onUserChange(null);
      lastLookedUp.current = null;
    }
  }, [connected, publicKey?.toBase58()]);

  const handleUsernameComplete = async (username: string) => {
    setShowUsernameModal(false);
    if (!activeWalletAddress) return;

    const { data } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .eq("wallet_address", activeWalletAddress)
      .maybeSingle();

    if (data) {
      const connectedUser: ConnectedUser = {
        userId: data.id,
        username: data.username,
        avatarUrl: data.avatar_url || null,
        walletAddress: activeWalletAddress,
      };
      setUser(connectedUser);
      onUserChange(connectedUser);
    }
  };

  const handleUsernameModalClose = () => {
    setShowUsernameModal(false);
    if (isEmbeddedWallet) {
      handleEmbeddedDisconnect();
    } else {
      disconnect();
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2MB");
      return;
    }

    setUploadingAvatar(true);
    try {
      const walletAddress = user.walletAddress;
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${walletAddress}.${ext}`;

      const { data: existing } = await supabase.storage.from("avatar").list("", { search: walletAddress });
      if (existing && existing.length > 0) {
        await supabase.storage.from("avatar").remove(existing.map((f: any) => f.name));
      }

      const { error: uploadErr } = await supabase.storage.from("avatar").upload(filePath, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("avatar").getPublicUrl(filePath);
      const avatarUrl = urlData.publicUrl + "?t=" + Date.now();

      await supabase.from("users").update({ avatar_url: avatarUrl }).eq("wallet_address", walletAddress);

      const updated = { ...user, avatarUrl };
      setUser(updated);
      onUserChange(updated);
    } catch (err: any) {
      console.error("Avatar upload error:", err);
      alert("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleEmbeddedDisconnect = async () => {
    await disconnectWeb3Auth();
    setIsEmbeddedWallet(false);
    setEmbeddedPublicKey(null);
    setUser(null);
    onUserChange(null);
    lastLookedUp.current = null;
    setShowDropdown(false);
  };

  const handleDisconnect = async () => {
    if (isEmbeddedWallet) {
      await handleEmbeddedDisconnect();
    } else {
      await disconnect();
      setUser(null);
      onUserChange(null);
      lastLookedUp.current = null;
      setShowDropdown(false);
    }
  };

  // Classic wallet connect
  const handleClassicWalletClick = () => {
    setShowConnectOptions(false);
    const installed = wallets.filter((w) => w.readyState === "Installed");
    if (installed.length === 0) {
      setShowWalletList(true);
    } else if (installed.length === 1) {
      select(installed[0].adapter.name);
    } else {
      setShowWalletList(true);
    }
  };

  const handleSelectWallet = (walletName: any) => {
    select(walletName);
    setShowWalletList(false);
  };

  // Embedded wallet (Web3Auth) connect
  const handleQuickLoginClick = async () => {
    setShowConnectOptions(false);
    setWeb3authConnecting(true);
    try {
      const result = await connectWeb3Auth();
      if (!result) {
        setWeb3authConnecting(false);
        return;
      }

      const walletAddress = result.publicKey.toBase58();
      setIsEmbeddedWallet(true);
      setEmbeddedPublicKey(walletAddress);

      // Lookup user in Supabase
      const { data } = await supabase
        .from("users")
        .select("id, username, avatar_url")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      if (data?.username) {
        const connectedUser: ConnectedUser = {
          userId: data.id,
          username: data.username,
          avatarUrl: data.avatar_url || null,
          walletAddress,
        };
        setUser(connectedUser);
        onUserChange(connectedUser);
      } else {
        // Wait a moment for Web3Auth modal to close before showing username modal
        await new Promise(r => setTimeout(r, 800));
        setShowUsernameModal(true);
      }
    } catch (err) {
      console.error("[Web3Auth] Connect error:", err);
    } finally {
      setWeb3authConnecting(false);
    }
  };

  // Connected state — show avatar + username
  if (isConnected && user) {
    const shortAddr = user.walletAddress.slice(0, 4) + "..." + user.walletAddress.slice(-4);

    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setShowDropdown((d) => !d)}
          className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-gray-700 bg-white/5 hover:border-orange-500/40 transition-all backdrop-blur-md"
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-9 h-9 rounded-full object-cover border border-gray-600"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 text-sm font-bold">
              {user.username[0].toUpperCase()}
            </div>
          )}
          <span className="text-white text-base font-semibold">@{user.username}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <AnimatePresence>
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2 min-w-[200px] rounded-xl border border-gray-700 bg-[#141414]/95 backdrop-blur-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-800">
                <p className="text-white text-sm font-medium">@{user.username}</p>
                <p className="text-gray-500 text-xs">{shortAddr}</p>
                {isEmbeddedWallet && (
                  <p className="text-orange-400/60 text-[10px] mt-0.5">Embedded Wallet</p>
                )}
              </div>
              <button
                onClick={() => { avatarInputRef.current?.click(); setShowDropdown(false); }}
                className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth={1.5} fill="none" />
                </svg>
                {uploadingAvatar ? "Uploading..." : user.avatarUrl ? "Change Avatar" : "Set Avatar"}
              </button>
              <button
                onClick={handleDisconnect}
                className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Disconnect
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Loading state
  if (connecting || lookingUp || web3authConnecting) {
    return (
      <div className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-gray-700 bg-white/5 backdrop-blur-md">
        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-400 text-sm">Connecting...</span>
      </div>
    );
  }

  // Disconnected state — show connect button with dropdown
  return (
    <>
      <div ref={connectRef} className="relative">
        <button
          onClick={() => setShowConnectOptions((s) => !s)}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl text-base font-semibold border border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/60 transition-all backdrop-blur-md"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Connect to Comment
        </button>

        <AnimatePresence>
          {showConnectOptions && !showWalletList && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute left-1/2 -translate-x-1/2 mt-2 w-[260px] rounded-xl border border-gray-700 bg-[#141414]/95 backdrop-blur-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-gray-800">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Connect Wallet</p>
              </div>

              {/* Classic Wallet Option */}
              <button
                onClick={handleClassicWalletClick}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6zm0 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5" />
                    <circle cx="16.5" cy="12" r="1" fill="currentColor" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-sm font-medium group-hover:text-orange-300 transition-colors">Browser Wallet</p>
                  <p className="text-gray-500 text-xs">Phantom, Solflare, etc.</p>
                </div>
              </button>

              {/* Quick Login Option */}
              <button
                onClick={handleQuickLoginClick}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors border-t border-gray-800/50 group"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500/20 to-yellow-500/20 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24">
                    <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth={1.5} />
                    <path d="M3 8l9 5 9-5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-sm font-medium group-hover:text-orange-300 transition-colors">Quick Login</p>
                  <p className="text-gray-500 text-xs">Email, Google, or social</p>
                </div>
              </button>
            </motion.div>
          )}

          {/* Wallet list for classic wallets */}
          {showWalletList && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute left-1/2 -translate-x-1/2 mt-2 min-w-[240px] rounded-xl border border-gray-700 bg-[#141414]/95 backdrop-blur-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
                <button
                  onClick={() => { setShowWalletList(false); setShowConnectOptions(true); }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Select Wallet</p>
              </div>
              {wallets.filter(w => w.readyState === "Installed").map((w) => (
                <button
                  key={w.adapter.name}
                  onClick={() => handleSelectWallet(w.adapter.name)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-white hover:bg-white/5 transition-colors"
                >
                  {w.adapter.icon && (
                    <img src={w.adapter.icon} alt={w.adapter.name} className="w-5 h-5" />
                  )}
                  <span>{w.adapter.name}</span>
                </button>
              ))}
              {wallets.filter(w => w.readyState === "Installed").length === 0 && (
                <div className="px-4 py-3 text-gray-500 text-sm">No wallets detected</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showUsernameModal && activeWalletAddress && (
        <UsernameModal
          walletAddress={activeWalletAddress}
          onComplete={handleUsernameComplete}
          onClose={handleUsernameModalClose}
        />
      )}
    </>
  );
}
