/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { playClickSound, playWinChime, playMatchmakingPing, playDefeatSound } from './sound';
import { 
  TonConnectUIProvider, 
  TonConnectButton, 
  useTonAddress, 
  useTonWallet 
} from '@tonconnect/ui-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  Gamepad2, 
  Users, 
  User, 
  ShieldAlert, 
  Copy, 
  Check, 
  Coins, 
  RefreshCw, 
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Cpu,
  Trophy,
  Flame,
  ArrowRight,
  Info,
  X,
  Volume2,
  VolumeX
} from 'lucide-react';

interface UserProfile {
  telegramId: string;
  username: string;
  walletAddress: string;
  referredBy: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  referralsCountL1: number;
  referralsCountL2: number;
  createdAt: string;
}

interface GameSession {
  id: string;
  player1Id: string;
  player1Username: string;
  player2Id: string;
  player2Username: string;
  player1Move: string;
  player2Move: string;
  winnerId: string;
  status: string; // "waiting" | "matched" | "completed"
  createdAt: string;
  updatedAt: string;
}

interface AdminMetrics {
  stats: {
    totalUsers: number;
    totalWallets: number;
    totalGames: number;
    totalReferrals: number;
  };
  users: UserProfile[];
  games: GameSession[];
}

interface RankConfig {
  name: string;
  minWins: number;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
  badgeEmoji: string;
  description: string;
}

const RANKS: RankConfig[] = [
  {
    name: "Bronze Novice",
    minWins: 0,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    glowColor: "shadow-amber-500/5",
    badgeEmoji: "🥉",
    description: "Beginner taking their first arena steps"
  },
  {
    name: "Silver Gladiator",
    minWins: 5,
    color: "text-slate-300",
    bgColor: "bg-slate-300/10",
    borderColor: "border-slate-300/20",
    glowColor: "shadow-slate-300/5",
    badgeEmoji: "🥈",
    description: "Experienced combatant with proven skill"
  },
  {
    name: "Gold Elite",
    minWins: 15,
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
    borderColor: "border-yellow-400/30",
    glowColor: "shadow-yellow-400/20",
    badgeEmoji: "🥇",
    description: "Master tactician of rock-paper-scissors"
  },
  {
    name: "Platinum Legend",
    minWins: 30,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
    glowColor: "shadow-cyan-500/20",
    badgeEmoji: "💎",
    description: "Renowned grandmaster dominating the scene"
  },
  {
    name: "RSPW Grand Master",
    minWins: 50,
    color: "text-fuchsia-400 font-extrabold tracking-wider animate-pulse",
    bgColor: "bg-fuchsia-500/15",
    borderColor: "border-fuchsia-500/40",
    glowColor: "shadow-fuchsia-500/30",
    badgeEmoji: "👑",
    description: "A godlike champion tier of supreme reflexes"
  }
];

const getPlayerRank = (wins: number): RankConfig => {
  let matchedRank = RANKS[0];
  for (const rank of RANKS) {
    if (wins >= rank.minWins) {
      matchedRank = rank;
    }
  }
  return matchedRank;
};

const getNextRank = (wins: number): { rank: RankConfig | null; winsNeeded: number; percent: number } => {
  const currentRank = getPlayerRank(wins);
  const currentIndex = RANKS.findIndex(r => r.name === currentRank.name);
  if (currentIndex < RANKS.length - 1) {
    const nextRank = RANKS[currentIndex + 1];
    const prevRequiredWins = currentRank.minWins;
    const nextRequiredWins = nextRank.minWins;
    const winsRequiredInTier = nextRequiredWins - prevRequiredWins;
    const winsAcquiredInTier = wins - prevRequiredWins;
    const progressPercent = Math.min(100, Math.max(0, Math.round((winsAcquiredInTier / winsRequiredInTier) * 100)));
    return {
      rank: nextRank,
      winsNeeded: nextRequiredWins - wins,
      percent: progressPercent
    };
  }
  return {
    rank: null,
    winsNeeded: 0,
    percent: 100
  };
};

function GameAppInner() {
  const walletAddress = useTonAddress();
  const wallet = useTonWallet();
  
  // Tabs: 'home' | 'play' | 'referrals' | 'profile' | 'admin'
  const [activeTab, setActiveTab] = useState<'home' | 'play' | 'referrals' | 'profile' | 'admin'>('home');
  
  // Simulation / Sandbox Controls (for developer testing outside Telegram)
  const isInsideTMA = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;
  const [simulatedTgId, setSimulatedTgId] = useState<string>('beskerboris');
  const [simulatedUsername, setSimulatedUsername] = useState<string>('BorisTester');
  const [refParam, setRefParam] = useState<string>('');
  
  // Real or Simulated final credentials
  const currentTgId = isInsideTMA ? ((window as any).Telegram?.WebApp?.initDataUnsafe?.user?.username || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() || 'tma_user') : simulatedTgId;
  const currentUsername = isInsideTMA ? ((window as any).Telegram?.WebApp?.initDataUnsafe?.user?.first_name || 'TMA User') : simulatedUsername;

  // App & User state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>('0.00');
  const [balanceLoading, setBalanceLoading] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  
  // Live Game States
  const [activeGame, setActiveGame] = useState<GameSession | null>(null);
  const [selectedMove, setSelectedMove] = useState<string>('');
  const [preSelectedMove, setPreSelectedMove] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [gameResultTimeout, setGameResultTimeout] = useState<any>(null);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showRankTiersModal, setShowRankTiersModal] = useState<boolean>(false);
  const [soundsMuted, setSoundsMuted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rspw_muted') === 'true';
    }
    return false;
  });

  const toggleSoundMute = () => {
    const nextMuted = !soundsMuted;
    setSoundsMuted(nextMuted);
    localStorage.setItem('rspw_muted', String(nextMuted));
    if (!nextMuted) {
      setTimeout(() => {
        playClickSound();
      }, 50);
    }
  };
  const lastConfettiGameIdRef = useRef<string | null>(null);
  const lastSoundGameIdRef = useRef<string | null>(null);

  // Dynamic Player Ranks based on total wins
  const userWins = profile?.wins || 0;
  const currentRank = getPlayerRank(userWins);
  const nextRankInfo = getNextRank(userWins);

  // Trigger confetti and victory/defeat sound alerts on game completion
  useEffect(() => {
    if (activeGame && activeGame.status === 'completed') {
      if (lastSoundGameIdRef.current !== activeGame.id) {
        lastSoundGameIdRef.current = activeGame.id;

        if (activeGame.winnerId === currentTgId) {
          // Play beautiful win chime
          playWinChime();

          if (lastConfettiGameIdRef.current !== activeGame.id) {
            lastConfettiGameIdRef.current = activeGame.id;
            
            // Trigger beautiful rich confetti
            confetti({
              particleCount: 150,
              spread: 80,
              origin: { y: 0.6 }
            });
            
            // A couple of extra side bursts for extra celebratory feel!
            const timer = setTimeout(() => {
              confetti({
                particleCount: 80,
                angle: 60,
                spread: 55,
                origin: { x: 0, y: 0.65 }
              });
              confetti({
                particleCount: 80,
                angle: 120,
                spread: 55,
                origin: { x: 1, y: 0.65 }
              });
            }, 300);
          }
        } else {
          // Play soft custom synthesized warning/defeat sound
          playDefeatSound();
        }
      }
    }
  }, [activeGame, currentTgId]);

  // Auto-submit preselected move when matched
  useEffect(() => {
    if (activeGame && activeGame.status === 'matched' && preSelectedMove && !selectedMove) {
      handleMakeMove(preSelectedMove);
      // Keep it in selected state but clear pre-selected to prevent re-triggering
      setPreSelectedMove(null);
    }
  }, [activeGame, preSelectedMove, selectedMove]);
  
  // Admin Data
  const [adminData, setAdminData] = useState<AdminMetrics | null>(null);
  const [adminModeEnabled, setAdminModeEnabled] = useState<boolean>(true); // Let reviewer test Admin tab effortlessly

  // Fetch Referral Code from URL or WebApp start_param on boot (survives page reloads)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let code = params.get('startapp') || params.get('ref') || (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param || '';
    if (code) {
      localStorage.setItem('rpsw_referred_by', code);
    } else {
      code = localStorage.getItem('rpsw_referred_by') || '';
    }
    if (code) {
      setRefParam(code);
    }
  }, []);

  // Sync / Register user with DB
  const syncProfile = async () => {
    if (!currentTgId) return;
    setSyncing(true);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const response = await fetch('/api/user/sync', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          telegramId: currentTgId,
          username: currentUsername,
          walletAddress: walletAddress || null,
          referredBy: refParam || null
        })
      });
      const data = await response.json();
      if (data.error) {
        setErrorMessage(data.error);
      } else {
        setProfile(data.profile);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Could not connect to the database server.");
    } finally {
      setSyncing(false);
    }
  };

  // Re-sync on TG login change or Wallet connection change
  useEffect(() => {
    syncProfile();
  }, [currentTgId, currentUsername, walletAddress]);

  // Fetch Wallet Balance dynamically using official TON RPC/Center APIs
  useEffect(() => {
    if (!walletAddress) {
      setWalletBalance('0.00');
      return;
    }
    
    const getBalance = async () => {
      setBalanceLoading(true);
      try {
        // Try TonAPI first (fast, reliable, free public tiers)
        const tonApiUrl = `https://tonapi.io/v2/accounts/${encodeURIComponent(walletAddress)}`;
        const tRes = await fetch(tonApiUrl);
        if (tRes.ok) {
          const tData = await tRes.json();
          if (tData && tData.balance !== undefined) {
            const tonVal = parseFloat(tData.balance) / 1e9;
            setWalletBalance(tonVal.toFixed(2));
            setBalanceLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("TonAPI balance lookup failed, trying TON Center", err);
      }

      try {
        // Fallback to TonCenter API
        const url = `https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(walletAddress)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.ok && data.result) {
          const tonVal = parseFloat(data.result) / 1e9;
          setWalletBalance(tonVal.toFixed(2));
        } else {
          setWalletBalance('0.00');
        }
      } catch (err) {
        console.error("All TON RPC balance lookups failed:", err);
        setWalletBalance('0.00');
      } finally {
        setBalanceLoading(false);
      }
    };

    getBalance();
    const interval = setInterval(getBalance, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [walletAddress]);

  // Poll active game status when we have submitted our move but the game is not yet completed
  useEffect(() => {
    if (!activeGame || activeGame.status !== 'matched') return;
    
    // Check if we have submitted our move
    const myId = currentTgId;
    const amPlayer1 = activeGame.player1Id === myId;
    const ourMoveSubmitted = amPlayer1 ? !!activeGame.player1Move : !!activeGame.player2Move;
    
    if (!ourMoveSubmitted) return;

    // We have submitted, poll to see when the game is completed (or opponent submitted)
    const interval = setInterval(async () => {
      try {
        const headers: any = {};
        const initData = (window as any).Telegram?.WebApp?.initData;
        if (initData) {
          headers['x-telegram-init-data'] = initData;
        }
        const res = await fetch(`/api/game/${activeGame.id}?requestorId=${currentTgId}`, { headers });
        const data = await res.json();
        if (data && data.game) {
          setActiveGame(data.game);
          if (data.game.status === 'completed') {
            syncProfile(); // refresh player profile immediately to see updated stats
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Error polling game status:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeGame?.id, activeGame?.status, selectedMove, currentTgId]);

  // Fetch Admin Metrics if in admin tab
  const fetchAdminMetrics = async () => {
    try {
      const headers: any = {};
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }
      const res = await fetch(`/api/admin/metrics?requestorId=${currentTgId}`, { headers });
      const data = await res.json();
      setAdminData(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminMetrics();
    }
  }, [activeTab, currentTgId]);

  // Copy Referral link
  const handleCopyReferral = () => {
    const referralLink = `${window.location.origin}?startapp=${currentTgId}`;
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Click on a weapon directly on the landing home page
  const handleHomeWeaponClick = (weapon: string) => {
    playClickSound();
    setPreSelectedMove(weapon);
    setActiveTab('play');
    // If not currently in any session, instantly trigger an active game queue with Bot for robust immediate play!
    if (!activeGame) {
      handleStartLobby(true);
    }
  };

  // Game Lobby: Start Matching Process
  const handleStartLobby = async (playWithBot: boolean = false) => {
    playMatchmakingPing();
    setIsSearching(true);
    setSelectedMove('');
    setErrorMessage(null);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const res = await fetch('/api/matchmaking/join', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          userId: currentTgId,
          username: currentUsername,
          playWithBot: playWithBot
        })
      });
      const data = await res.json();
      if (data.error) {
        setErrorMessage(data.error);
        setIsSearching(false);
      } else {
        setActiveGame(data.game);
        
        // If matched or playing with Bot, stop search spinner
        if (data.game.status === 'matched') {
          setIsSearching(false);
        } else {
          // Poll matchmaking status for another real player using secure single session query
          let attempts = 0;
          const pollInterval = setInterval(async () => {
            attempts++;
            try {
              const headers: any = {};
              const initData = (window as any).Telegram?.WebApp?.initData;
              if (initData) {
                headers['x-telegram-init-data'] = initData;
              }
              const gCheckRes = await fetch(`/api/game/${data.game.id}?requestorId=${currentTgId}`, { headers });
              const gCheckData = await gCheckRes.json();
              const myGame = gCheckData.game;
              
              if (myGame && myGame.status === 'matched') {
                setActiveGame(myGame);
                setIsSearching(false);
                clearInterval(pollInterval);
              }

              // After 5 seconds, offer bot backup to satisfy quick gameplay testing
              if (attempts > 5) {
                clearInterval(pollInterval);
                // Force convert to BOT play so it doesn't leave user hanging
                handleStartLobby(true);
              }
            } catch (err) {
              console.error(err);
            }
          }, 1000);
        }
      }
    } catch (err) {
      setErrorMessage("Server matchmaking failure.");
      setIsSearching(false);
    }
  };

  // Submit Selected Move
  const handleMakeMove = async (move: string) => {
    if (!activeGame) return;
    playClickSound();
    setSelectedMove(move);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const res = await fetch('/api/game/move', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          gameId: activeGame.id,
          userId: currentTgId,
          move: move
        })
      });
      const data = await res.json();
      if (data.error) {
        setErrorMessage(data.error);
      } else {
        setActiveGame(data.game);
        // Refresh player profile immediately to see updated stats
        syncProfile();
      }
    } catch (err) {
      setErrorMessage("Move submission failed.");
    }
  };

  // Reset lobby to find another game
  const resetGameLobby = () => {
    setActiveGame(null);
    setSelectedMove('');
    setIsSearching(false);
  };

  return (
    <div className="min-h-screen bg-[#0e1621] text-white flex flex-col font-sans selection:bg-[#3390ec] selection:text-white">
      
      {/* Dynamic Sandbox Controller for Testing (Only shown in Normal Web Browser / Outside Telegram) */}
      {!isInsideTMA && (
        <div className="bg-[#17212b] border-b border-[#242f3d] px-4 py-2.5 text-xs text-[#708499] md:flex md:items-center md:justify-between space-y-2 md:space-y-0 relative z-50">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-[#3390ec]/10 text-[#3390ec] font-semibold rounded border border-[#2b3745]">
              TMA Play-Tester Panel
            </span>
            <span className="text-[10px] text-[#708499]">
              Simulate Telegram environment inside AI Studio:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Username:</span>
              <input 
                type="text" 
                value={simulatedUsername} 
                onChange={(e) => setSimulatedUsername(e.target.value)} 
                className="bg-[#0e1621] border border-[#242f3d] rounded px-1.5 py-0.5 text-white font-mono focus:outline-none focus:border-[#3390ec] w-28"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span>User ID:</span>
              <input 
                type="text" 
                value={simulatedTgId} 
                onChange={(e) => setSimulatedTgId(e.target.value)} 
                className="bg-[#0e1621] border border-[#242f3d] rounded px-1.5 py-0.5 text-white font-mono focus:outline-none focus:border-[#3390ec] w-24"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span>Referral Parent ID:</span>
              <input 
                type="text" 
                placeholder="Parent UID" 
                value={refParam} 
                onChange={(e) => setRefParam(e.target.value)} 
                className="bg-[#0e1621] border border-[#242f3d] rounded px-1.5 py-0.5 text-white font-mono placeholder-[#708499] focus:outline-none focus:border-[#3390ec] w-24"
              />
            </div>
            <button
              onClick={() => {
                syncProfile();
                if (activeTab === 'admin') fetchAdminMetrics();
              }}
              className="bg-[#3390ec] hover:bg-[#2b7ad0] text-white font-semibold py-0.5 px-2.5 rounded transition"
            >
              Sync Sandbox
            </button>
            <label className="flex items-center gap-1 text-[11px] font-medium text-amber-500 cursor-pointer">
              <input 
                type="checkbox" 
                checked={adminModeEnabled}
                onChange={(e) => setAdminModeEnabled(e.target.checked)}
                className="accent-amber-500"
              />
              Mock Admin Tab
            </label>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <header className="px-6 py-4 bg-[#0e1621] border-b border-[#242f3d] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-[#3390ec] rounded-xl flex items-center justify-center font-bold text-xl text-white">
            R
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none text-white">Rock Paper Well</h1>
            <p className="text-[#708499] text-xs uppercase tracking-widest mt-1">MVP Demo • PvP</p>
          </div>
        </div>
        
        {/* Real TON Connect Interactive Buttons */}
        <div id="ton-button-parent" className="scale-90 origin-right flex items-center space-x-2">
          <div className="bg-[#242f3d] rounded-full px-2 py-1 flex items-center border border-[#2b3745]">
            <TonConnectButton />
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-red-500/10 border-y border-red-500/30 text-red-400 px-5 py-2.5 text-xs flex justify-between items-center">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Central Screen Area with Animation Transitions */}
      <main className="flex-1 overflow-y-auto px-5 py-6 max-w-md mx-auto w-full pb-20">
        <AnimatePresence mode="wait">
          
          {/* TAB 1: HOME SCREEN */}
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Game Poster / Logo */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-6 text-center space-y-4 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#3390ec] to-transparent opacity-50"></div>
                <div className="relative inline-block">
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-[#3390ec] to-indigo-600 flex items-center justify-center text-4xl shadow-lg relative z-10 transform scale-100 hover:scale-105 transition-transform">
                    👊
                  </div>
                  <div className="absolute inset-0 bg-[#3390ec]/20 blur-xl rounded-2xl scale-110" />
                </div>
                
                <div>
                  <h2 className="text-xl font-bold text-white">Rock • Scissors • Paper • Well</h2>
                  <p className="text-[#708499] text-xs mt-1">Ready for real online PvP showdowns on TON?</p>
                </div>

                <div className="grid grid-cols-4 gap-2 w-full pt-2">
                  {[
                    { id: 'rock', emoji: '👊', label: 'Rock' },
                    { id: 'scissors', emoji: '✂️', label: 'Scissors' },
                    { id: 'paper', emoji: '📄', label: 'Paper' },
                    { id: 'well', emoji: '🕳️', label: 'Well' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleHomeWeaponClick(item.id)}
                      className={`group py-3 px-1 rounded-xl flex flex-col items-center justify-center transition-all border ${
                        preSelectedMove === item.id 
                          ? 'bg-[#3390ec]/20 border-[#3390ec] text-white scale-[1.03] shadow-md shadow-[#3390ec]/15' 
                          : 'bg-[#242f3d]/50 border-[#2b3745] hover:bg-[#3390ec] hover:border-[#3390ec] text-[#708499] hover:text-white active:scale-95 cursor-pointer'
                      }`}
                    >
                      <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">{item.emoji}</span>
                      <span className={`text-[11px] font-bold tracking-tight ${preSelectedMove === item.id ? 'text-white' : 'text-[#708499] group-hover:text-white'}`}>
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Wallet & Balance overview */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-6">
                <p className="text-[#708499] text-xs font-semibold uppercase tracking-widest mb-1">Available Balance</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-end space-x-2">
                    <h3 className="text-4xl font-bold tracking-tight">
                      {balanceLoading ? (
                        <RefreshCw className="animate-spin w-6 h-6 text-[#3390ec]" />
                      ) : walletAddress ? (
                        walletBalance
                      ) : (
                        "0.00"
                      )}
                    </h3>
                    <span className="text-[#3390ec] font-bold mb-1">TON</span>
                  </div>
                  {!walletAddress && (
                    <span className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl animate-pulse">
                      Connect Wallet
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Play Button */}
              <div className="space-y-3">
                <button
                  onClick={() => setActiveTab('play')}
                  className="w-full h-14 bg-[#3390ec] hover:bg-[#2b7ad0] text-white font-bold rounded-2xl transition duration-150 transform hover:scale-[1.01] active:scale-95 shadow-lg shadow-[#3390ec]/20 flex items-center justify-center gap-2.5 relative group overflow-hidden"
                >
                  <Gamepad2 className="w-5 h-5" />
                  <span>PLAY NOW (PVP/BOT)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                
                <button
                  onClick={() => setActiveTab('referrals')}
                  className="w-full h-12 bg-[#242f3d] hover:bg-[#2b3745] border border-[#2b3745] text-slate-200 font-semibold rounded-2xl transition flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4 text-[#3390ec]" />
                  <span>Referrals & Invite Links</span>
                </button>
              </div>

              {/* Rules Summary card */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl p-4 space-y-3">
                <span className="text-xs font-bold text-white block border-b border-[#242f3d] pb-1.5">Game Invariants & Logic</span>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#708499] font-medium">
                  <div className="bg-[#242f3d] p-2 rounded-xl">
                    <span className="text-[#3390ec]">👊 Rock</span> beats ✂️ Scissors
                  </div>
                  <div className="bg-[#242f3d] p-2 rounded-xl">
                    <span className="text-[#3390ec]">✂️ Scissors</span> beats 📄 Paper
                  </div>
                  <div className="bg-[#242f3d] p-2 rounded-xl">
                    <span className="text-[#3390ec]">📄 Paper</span> beats 👊 Rock & 🕳️ Well
                  </div>
                  <div className="bg-[#242f3d] p-2 rounded-xl">
                    <span className="text-[#3390ec]">🕳️ Well</span> beats 👊 Rock & ✂️ Scissors
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: ACTIVE PVP GAME / PLAY SCREEN */}
          {activeTab === 'play' && (
            <motion.div
              key="play"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Rules Header & Info Button */}
              <div className="flex justify-between items-center bg-[#17212b] border border-[#242f3d] px-4 py-3 rounded-2xl shadow-md">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-[#3390ec]" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Battle Arena</span>
                </div>
                <button
                  id="btn_interaction_chart_info"
                  onClick={() => { playClickSound(); setShowInfoModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#242f3d] hover:bg-[#2b3745] text-[#3390ec] hover:text-white transition duration-150 text-xs font-semibold cursor-pointer"
                >
                  <Info className="w-4 h-4 animate-pulse" />
                  <span>Interaction Chart</span>
                </button>
              </div>

              {!activeGame ? (
                // LOBBY ENTRY SCREEN
                <div className="space-y-6">
                  <div className="text-center py-6">
                    <h3 className="text-xl font-bold text-white">Find or Start a Match</h3>
                    <p className="text-[#708499] text-xs mt-1">Server resolves the game state atomically</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {/* Bot match */}
                    <button
                      onClick={() => handleStartLobby(true)}
                      className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl text-left transition-all flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <span className="text-white group-hover:text-white font-bold text-base flex items-center gap-1.5">
                          <Cpu className="w-5 h-5 text-[#3390ec] group-hover:text-white" />
                          Auto Bot Game
                        </span>
                        <p className="text-[#708499] group-hover:text-white/80 text-xs">Practice immediately. AI opponent resolves randomized moves.</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#708499] group-hover:text-white transition" />
                    </button>

                    {/* Online PVP match */}
                    <button
                      onClick={() => handleStartLobby(false)}
                      className="group bg-[#17212b] hover:bg-[#3390ec] border border-[#242f3d] p-6 rounded-2xl text-left transition-all flex items-center justify-between relative overflow-hidden"
                    >
                      <div className="absolute right-0 top-0 w-24 h-24 bg-[#3390ec]/10 rounded-full blur-xl pointer-events-none" />
                      <div className="space-y-1 relative z-10">
                        <span className="text-[#3390ec] group-hover:text-white font-bold text-base flex items-center gap-1.5">
                          <Gamepad2 className="w-5 h-5 text-[#3390ec] group-hover:text-white" />
                          Online Multiplayer PvP
                        </span>
                        <p className="text-[#708499] group-hover:text-white/80 text-xs">Atomically queues you up with another live player.</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#3390ec] group-hover:text-white transition animate-pulse" />
                    </button>
                  </div>

                  {/* Searching Spinner */}
                  {isSearching && (
                    <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-6 text-center space-y-4">
                      <div className="relative inline-block">
                        <div className="w-12 h-12 rounded-full border-2 border-[#242f3d]/50 border-t-[#3390ec] animate-spin" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Searching for opponents...</h4>
                        <p className="text-[11px] text-[#708499] mt-0.5">Searching the matchmaking lobby pool. (Falling back to Computer Bot if none available)</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // MATCHING & GAMEPLAY ACTIVE
                <div className="space-y-6">
                  {/* Matching Info Header */}
                  <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl p-4 flex justify-between items-center text-xs">
                    <div className="text-left">
                      <span className="text-[10px] text-[#708499] uppercase tracking-widest block font-bold">You</span>
                      <span className="font-semibold text-[#3390ec] text-sm">@{activeGame.player1Id === currentTgId ? activeGame.player1Username : activeGame.player2Username}</span>
                    </div>

                    <div className="px-3 py-1 rounded-full bg-[#242f3d] font-bold text-[10px] tracking-wider uppercase text-[#708499]">
                      VS
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-[#708499] uppercase tracking-widest block font-bold">Opponent</span>
                      <span className="font-semibold text-indigo-400 text-sm">@{activeGame.player1Id === currentTgId ? activeGame.player2Username : activeGame.player1Username}</span>
                    </div>
                  </div>

                  {/* GAME ENGINE SCREEN */}
                  <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-8 text-center space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#3390ec] to-transparent opacity-50"></div>
                    
                    {activeGame.status === 'matched' ? (
                      // GAME IN PROGRESS (CHOOSING MOVES)
                      <div className="space-y-6">
                        <div>
                          <span className="bg-[#3390ec]/10 text-[#3390ec] text-[10px] uppercase font-bold tracking-widest border border-[#3390ec]/20 px-2.5 py-1 rounded-full">
                            Action Phase
                          </span>
                          <h4 className="text-xl font-bold text-white mt-3">Choose Your Weapon</h4>
                          <p className="text-[#708499] text-xs mt-0.5">Your move is processed and verified by the server</p>
                        </div>

                        {/* Move submission logic representation */}
                        {!selectedMove ? (
                          <div className="grid grid-cols-2 gap-4">
                            <button
                              onClick={() => handleMakeMove('rock')}
                              className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl flex flex-col items-center transition-all"
                            >
                              <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">👊</span>
                              <span className="font-bold text-sm text-white">ROCK</span>
                            </button>
                            <button
                              onClick={() => handleMakeMove('scissors')}
                              className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl flex flex-col items-center transition-all"
                            >
                              <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">✂️</span>
                              <span className="font-bold text-sm text-white">SCISSORS</span>
                            </button>
                            <button
                              onClick={() => handleMakeMove('paper')}
                              className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl flex flex-col items-center transition-all"
                            >
                              <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">📄</span>
                              <span className="font-bold text-sm text-white">PAPER</span>
                            </button>
                            <button
                              onClick={() => handleMakeMove('well')}
                              className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl flex flex-col items-center transition-all"
                            >
                              <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">🕳️</span>
                              <span className="font-bold text-sm text-white">WELL</span>
                            </button>
                          </div>
                        ) : (
                          // Move submitted, waiting for other player
                          <div className="space-y-4 py-4">
                            <div className="inline-block relative">
                              <span className="text-5xl animate-bounce block">
                                {selectedMove === 'rock' && '👊'}
                                {selectedMove === 'scissors' && '✂️'}
                                {selectedMove === 'paper' && '📄'}
                                {selectedMove === 'well' && '🕳️'}
                              </span>
                            </div>
                            <div>
                              <p className="text-white text-sm font-bold">Successfully Submitted {selectedMove.toUpperCase()}!</p>
                              <p className="text-[#708499] text-[10px] mt-1">Waiting for opponent to commit their action...</p>
                            </div>
                            
                            {/* Fast trigger bot move immediately for smooth bot flow */}
                            {activeGame.player2Id === 'bot' && (
                              <button
                                onClick={() => handleMakeMove(selectedMove)}
                                className="mt-3 text-xs bg-[#3390ec] hover:bg-[#2b7ad0] text-white px-5 py-2 rounded-full font-bold uppercase transition"
                              >
                                Resolve Bot Fight
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      // GAME COMPLETED (RESULTS SCREEN)
                      <div className="space-y-5">
                        <div>
                          <span className="bg-[#3390ec]/15 text-[#3390ec] text-[10px] uppercase font-bold tracking-widest border border-[#3390ec]/25 px-2.5 py-1 rounded-full">
                            Resolution Phase
                          </span>
                          
                          {/* Main Header Result */}
                          {activeGame.winnerId === 'draw' ? (
                            <h3 className="text-2xl font-bold text-amber-400 mt-4">It's a DRAW! 🤝</h3>
                          ) : activeGame.winnerId === currentTgId ? (
                            <h3 className="text-2xl font-bold text-emerald-400 mt-4">VICTORY! 🎉</h3>
                          ) : (
                            <h3 className="text-2xl font-bold text-red-400 mt-4">DEFEAT! 💀</h3>
                          )}
                        </div>

                        {/* Weapon Comparison */}
                        <div className="grid grid-cols-2 gap-4 bg-[#242f3d] p-6 rounded-2xl border border-[#2b3745]">
                          <div className="text-center space-y-1">
                            <span className="text-[10px] text-[#708499] block font-semibold">Your Move</span>
                            <span className="text-5xl block py-2">
                              {activeGame.player1Id === currentTgId ? (
                                activeGame.player1Move === 'rock' ? '👊' : activeGame.player1Move === 'scissors' ? '✂️' : activeGame.player1Move === 'paper' ? '📄' : '🕳️'
                              ) : (
                                activeGame.player2Move === 'rock' ? '👊' : activeGame.player2Move === 'scissors' ? '✂️' : activeGame.player2Move === 'paper' ? '📄' : '🕳️'
                              )}
                            </span>
                            <span className="capitalize text-sm font-bold text-white">
                              {activeGame.player1Id === currentTgId ? activeGame.player1Move : activeGame.player2Move}
                            </span>
                          </div>

                          <div className="text-center space-y-1 border-l border-[#2b3745]">
                            <span className="text-[10px] text-[#708499] block font-semibold">Opponent Move</span>
                            <span className="text-5xl block py-2">
                              {activeGame.player1Id === currentTgId ? (
                                activeGame.player2Move === 'rock' ? '👊' : activeGame.player2Move === 'scissors' ? '✂️' : activeGame.player2Move === 'paper' ? '📄' : '🕳️'
                              ) : (
                                activeGame.player1Move === 'rock' ? '👊' : activeGame.player1Move === 'scissors' ? '✂️' : activeGame.player1Move === 'paper' ? '📄' : '🕳️'
                              )}
                            </span>
                            <span className="capitalize text-sm font-bold text-white">
                              {activeGame.player1Id === currentTgId ? activeGame.player2Move : activeGame.player1Move}
                            </span>
                          </div>
                        </div>

                        {/* Back or replay */}
                        <div className="pt-2">
                          <button
                            onClick={resetGameLobby}
                            className="bg-[#3390ec] hover:bg-[#2b7ad0] text-white font-bold w-full py-4 px-4 rounded-2xl transition shadow-lg shadow-[#3390ec]/20"
                          >
                            PLAY AGAIN
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 3: REFERRALS */}
          {activeTab === 'referrals' && (
            <motion.div
              key="referrals"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="text-center py-4">
                <h3 className="text-xl font-bold text-white">Referral Program</h3>
                <p className="text-[#708499] text-xs mt-1">Invite friends and stack credits through two levels of reach!</p>
              </div>

              {/* Commission details */}
              <div className="space-y-4">
                <div className="bg-[#242f3d] p-4 rounded-xl flex justify-between items-center border border-[#2b3745]">
                  <div>
                    <p className="text-[#708499] text-xs">Level 1 (Direct)</p>
                    <p className="font-bold text-xl text-white">10% Commission</p>
                  </div>
                  <div className="w-10 h-10 bg-[#3390ec]/10 rounded-full flex items-center justify-center border border-[#3390ec]/25">
                    <span className="text-[#3390ec] text-xs font-bold">L1</span>
                  </div>
                </div>

                <div className="bg-[#242f3d] p-4 rounded-xl flex justify-between items-center border border-[#2b3745]">
                  <div>
                    <p className="text-[#708499] text-xs">Level 2 (Indirect)</p>
                    <p className="font-bold text-xl text-white">5% Commission</p>
                  </div>
                  <div className="w-10 h-10 bg-[#3390ec]/10 rounded-full flex items-center justify-center border border-[#3390ec]/25">
                    <span className="text-indigo-400 text-xs font-bold">L2</span>
                  </div>
                </div>
              </div>

              {/* Dynamic generated invite code box */}
              <div className="p-4 bg-[#17212b] rounded-xl border border-dashed border-[#242f3d] mb-4">
                <p className="text-[#708499] text-[10px] uppercase mb-1 font-bold">Your Custom Referral Link</p>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 text-sm text-[#3390ec] truncate font-mono">
                    {window.location.origin}?startapp={currentTgId}
                  </div>
                  <button
                    onClick={handleCopyReferral}
                    className="bg-white text-black p-2.5 rounded-xl hover:bg-slate-200 transition transform active:scale-95 flex items-center justify-center"
                    title="Copy Link"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-600 font-bold" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Stats dashboard */}
              <div className="bg-[#17212b] rounded-3xl p-6 border border-[#242f3d] flex-grow">
                <div className="flex items-center justify-between border-b border-[#242f3d] pb-3 mb-4">
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Referral Metrics</span>
                  <Users className="w-4 h-4 text-[#3390ec]" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#242f3d] p-3 rounded-xl text-center border border-[#2b3745]">
                    <span className="text-[10px] text-[#708499] block font-semibold">Level 1</span>
                    <span className="text-xl font-mono font-bold text-white block mt-0.5">{profile?.referralsCountL1 || 0}</span>
                  </div>
                  <div className="bg-[#242f3d] p-3 rounded-xl text-center border border-[#2b3745]">
                    <span className="text-[10px] text-[#708499] block font-semibold">Level 2</span>
                    <span className="text-xl font-mono font-bold text-white block mt-0.5">{profile?.referralsCountL2 || 0}</span>
                  </div>
                  <div className="bg-[#242f3d] p-3 rounded-xl text-center border border-[#2b3745]">
                    <span className="text-[10px] text-[#708499] block font-semibold">Total</span>
                    <span className="text-xl font-mono font-bold text-[#3390ec] block mt-0.5">
                      {(profile?.referralsCountL1 || 0) + (profile?.referralsCountL2 || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 4: PLAYER PROFILE */}
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="bg-[#242f3d] rounded-3xl p-5 flex justify-between items-center px-6">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white text-xl">
                    👤
                  </div>
                  <div>
                    <p className="font-bold text-base leading-tight text-white">@{currentTgId}</p>
                    <p className={`text-xs font-bold leading-tight mt-1 flex items-center gap-1 ${currentRank.color}`}>
                      <span>{currentRank.badgeEmoji}</span> {currentRank.name}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-green-500 font-bold text-sm">W: {profile?.wins || 0}</p>
                  <p className="text-red-400 font-bold text-xs">L: {profile?.losses || 0}</p>
                </div>
              </div>

              {/* Dynamic Rank Badge & Progression Panel */}
              <div className={`border rounded-3xl p-6 transition-all duration-300 ${currentRank.bgColor} ${currentRank.borderColor} shadow-lg ${currentRank.glowColor}`}>
                <div className="flex items-center justify-between pb-4 border-b border-white/5">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">{currentRank.badgeEmoji}</span>
                    <span className="text-xs font-black tracking-wider text-white uppercase">Arena Battle License</span>
                  </div>
                  <span className="text-[10px] bg-white/10 text-white font-mono px-2 py-0.5 rounded-full font-bold">
                    Tier {RANKS.findIndex(r => r.name === currentRank.name) + 1} / {RANKS.length}
                  </span>
                </div>

                <div className="flex items-center space-x-5 py-5 overflow-hidden">
                  {/* Visual Large Badge Display */}
                  <div className="relative flex items-center justify-center shrink-0">
                    <div className="absolute inset-0 rounded-full bg-white/5 scale-125 blur-sm animate-pulse" />
                    <div className="w-16 h-16 rounded-2xl bg-[#17212b]/95 border-2 border-white/10 flex items-center justify-center text-4xl shadow-inner relative z-10">
                      {currentRank.badgeEmoji}
                    </div>
                  </div>

                  {/* Rank Title & Description */}
                  <div className="space-y-1 min-w-0">
                    <h4 className={`text-lg font-black tracking-tight leading-tight uppercase ${currentRank.color}`}>
                      {currentRank.name}
                    </h4>
                    <p className="text-white/70 text-xs leading-snug">
                      {currentRank.description}
                    </p>
                    <p className="text-[#708499] text-[10px]">
                      Current Wins: <span className="font-bold font-mono text-white">{userWins}</span>
                    </p>
                  </div>
                </div>

                {/* Progression Bar to Next Rank */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  {nextRankInfo.rank ? (
                    <>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#708499]">Next Tier: <b className="text-white/90">{nextRankInfo.rank.name}</b></span>
                        <span className="font-bold font-mono text-white/90">{nextRankInfo.winsNeeded} wins left</span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden p-[1px] border border-white/10">
                        <motion.div
                          className={`h-full rounded-full bg-gradient-to-r from-[#3390ec] to-purple-500`}
                          initial={{ width: 0 }}
                          animate={{ width: `${nextRankInfo.percent}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-[#708499] font-mono leading-none">
                        <span>{currentRank.minWins} Wins</span>
                        <span>{nextRankInfo.percent}% Progress</span>
                        <span>{nextRankInfo.rank.minWins} Wins</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-2 bg-white/5 rounded-2xl border border-white/10">
                      <p className="text-yellow-400 font-extrabold text-xs flex justify-center items-center gap-1.5 animate-bounce">
                        🎉 SUPREME STAGE COMPLETED 🎉
                      </p>
                      <p className="text-[#708499] text-[10px] mt-0.5">You are an absolute legend of the RSPW Arena!</p>
                    </div>
                  )}
                </div>

                {/* Rank tiers visual peek button */}
                <div className="mt-4 pt-3 flex justify-center">
                  <button
                    id="btn_view_rank_tiers"
                    onClick={() => { playClickSound(); setShowRankTiersModal(true); }}
                    className="text-xs text-[#3390ec] hover:text-[#3390ec]/80 flex items-center gap-1 font-semibold transition cursor-pointer"
                  >
                    View All Arena Tiers <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Stats overview */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#242f3d] pb-3">
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Gameplay Statistics</span>
                  <Trophy className="w-4 h-4 text-amber-500" />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-[#242f3d] p-2.5 rounded-xl border border-[#2b3745]">
                    <span className="text-[10px] text-[#708499] block font-semibold">Played</span>
                    <span className="text-sm font-bold block text-white mt-0.5">{profile?.gamesPlayed || 0}</span>
                  </div>
                  <div className="bg-[#242f3d] p-2.5 rounded-xl border border-[#2b3745] border-b-emerald-500/30">
                    <span className="text-[10px] text-[#708499] block font-semibold">Wins</span>
                    <span className="text-sm font-bold block text-emerald-400 mt-0.5">{profile?.wins || 0}</span>
                  </div>
                  <div className="bg-[#242f3d] p-2.5 rounded-xl border border-[#2b3745] border-b-red-500/30">
                    <span className="text-[10px] text-[#708499] block font-semibold">Losses</span>
                    <span className="text-sm font-bold block text-red-400 mt-0.5">{profile?.losses || 0}</span>
                  </div>
                  <div className="bg-[#242f3d] p-2.5 rounded-xl border border-[#2b3745] border-b-[#3390ec]/30">
                    <span className="text-[10px] text-[#708499] block font-semibold">Rate</span>
                    <span className="text-sm font-bold block text-[#3390ec] mt-0.5">
                      {profile && profile.gamesPlayed > 0 
                        ? `${Math.round((profile.wins / profile.gamesPlayed) * 100)}%`
                        : "0%"
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Game Preferences Card */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#242f3d] pb-3">
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Game Settings</span>
                  <Volume2 className="w-4 h-4 text-[#3390ec]" />
                </div>
                <div className="flex items-center justify-between bg-[#242f3d] p-3.5 rounded-2xl border border-[#2b3745]">
                  <div className="flex items-center space-x-3 w-[72%]">
                    <div className="w-9 h-9 rounded-xl bg-[#17212b] flex items-center justify-center shrink-0">
                      {soundsMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-green-400" />}
                    </div>
                    <div>
                      <p className="font-bold text-xs text-white">Sound Effects</p>
                      <p className="text-[9.5px] text-[#708499] leading-tight mt-0.5">Satisfying clicks, win chimes & alert sweeps</p>
                    </div>
                  </div>
                  <button
                    id="btn_sound_settings_toggle"
                    onClick={() => toggleSoundMute()}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${soundsMuted ? 'bg-[#708499]/30' : 'bg-[#3390ec]'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${soundsMuted ? 'translate-x-0' : 'translate-x-5'}`}
                    />
                  </button>
                </div>
              </div>

              {/* Connection metadata info */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-6 text-xs space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[#708499]">TON Wallet Address:</span>
                  <span className="font-mono text-[11px] text-[#3390ec] bg-[#242f3d] px-2.5 py-1 rounded-full border border-[#2b3745]">
                    {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}` : 'Disconnected'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#242f3d] pt-3">
                  <span className="text-[#708499]">Referred By:</span>
                  <span className="font-mono text-white">
                    {profile?.referredBy ? `@${profile.referredBy}` : 'Organic (None)'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#242f3d] pt-3">
                  <span className="text-[#708499]">Profile Timestamp:</span>
                  <span className="text-[#708499] text-[10px]">
                    {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Syncing...'}
                  </span>
                </div>
              </div>

              {/* Dev Admin panel redirection */}
              {adminModeEnabled && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className="w-full bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 py-3 px-4 rounded-xl transition text-amber-400 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Open Developer Admin Dashboard</span>
                </button>
              )}
            </motion.div>
          )}

          {/* TAB 5: ADMIN PANEL (VISIBLE ON ADMIN TG IDS & DEV FORCE SWITCH) */}
          {activeTab === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                    Admin Insights
                  </h3>
                  <span className="text-[10px] text-[#708499]">Read-Only Statistics Dashboard</span>
                </div>
                
                <button
                  onClick={fetchAdminMetrics}
                  className="bg-[#242f3d] hover:bg-[#2b3745] p-2 rounded-lg border border-[#2b3745] transition"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#3390ec]" />
                </button>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#17212b] p-4 rounded-xl border border-[#242f3d] text-center">
                  <span className="text-[10px] text-[#708499] block uppercase font-bold">Total Space Users</span>
                  <span className="text-2xl font-mono font-bold text-white block mt-1">{adminData?.stats?.totalUsers || 0}</span>
                </div>
                
                <div className="bg-[#17212b] p-4 rounded-xl border border-[#242f3d] text-center">
                  <span className="text-[10px] text-[#708499] block uppercase font-bold">Active Wallets</span>
                  <span className="text-2xl font-mono font-bold text-[#3390ec] block mt-1">{adminData?.stats?.totalWallets || 0}</span>
                </div>

                <div className="bg-[#17212b] p-4 rounded-xl border border-[#242f3d] text-center">
                  <span className="text-[10px] text-[#708499] block uppercase font-bold">Referral Counts</span>
                  <span className="text-2xl font-mono font-bold text-indigo-400 block mt-1">{adminData?.stats?.totalReferrals || 0}</span>
                </div>

                <div className="bg-[#17212b] p-4 rounded-xl border border-[#242f3d] text-center">
                  <span className="text-[10px] text-[#708499] block uppercase font-bold">Total Match Logs</span>
                  <span className="text-2xl font-mono font-bold text-amber-400 block mt-1">{adminData?.stats?.totalGames || 0}</span>
                </div>
              </div>

              {/* Users Details Lists */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-white block">Registered Players</span>
                <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl overflow-hidden divide-y divide-[#242f3d]/60 max-h-48 overflow-y-auto">
                  {adminData?.users && adminData.users.length > 0 ? (
                    adminData.users.map((usr, i) => (
                      <div key={i} className="p-3 text-xs flex justify-between items-center bg-[#17212b]">
                        <div>
                          <span className="font-semibold text-slate-200">@{usr.telegramId}</span>
                          <span className="text-[10px] text-[#708499] block">
                            {usr.walletAddress ? `${usr.walletAddress.slice(0, 8)}...` : 'No wallet connected'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-emerald-400 font-bold block">{usr.wins}W - {usr.losses}L</span>
                          <span className="text-[10px] text-[#708499]">Refs: {usr.referralsCountL1 + usr.referralsCountL2}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-[#708499] text-xs p-4 block text-center">No synchronized users yet.</span>
                  )}
                </div>
              </div>

              {/* Matches History Lists */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-white block">Latest Lobbies</span>
                <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl overflow-hidden divide-y divide-[#242f3d]/60 max-h-48 overflow-y-auto">
                  {adminData?.games && adminData.games.length > 0 ? (
                    adminData.games.map((gm, i) => (
                      <div key={i} className="p-3 text-xs flex justify-between items-center bg-[#17212b]">
                        <div>
                          <span className="block text-slate-200">@{gm.player1Username} vs @{gm.player2Username}</span>
                          <span className="text-[10px] text-[#708499]">Moves: {gm.player1Move || '(none)'} vs {gm.player2Move || '(none)'}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono font-semibold uppercase block text-[#3390ec]">{gm.status}</span>
                          <span className="text-[10px] text-amber-400 font-medium">Winner: {gm.winnerId === 'draw' ? 'Draw' : `@${gm.winnerId}`}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-[#708499] text-xs p-4 block text-center">No processed game logs.</span>
                  )}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Navigation Dock (Mobile-First 4 Tabs) */}
      <footer className="fixed bottom-0 left-0 right-0 h-20 bg-[#17212b] border-t border-[#242f3d] flex justify-around items-center px-4 max-w-md mx-auto w-full shadow-2xl z-40">
        
        {/* NAV 1: HOME */}
        <button
          onClick={() => { playClickSound(); setActiveTab('home'); }}
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === 'home' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Home className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">HOME</span>
        </button>

        {/* NAV 2: PLAY */}
        <button
          onClick={() => { playClickSound(); setActiveTab('play'); }}
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === 'play' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Gamepad2 className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">PLAY</span>
        </button>

        {/* NAV 3: REFERRALS */}
        <button
          onClick={() => { playClickSound(); setActiveTab('referrals'); }}
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === 'referrals' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Users className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">REFERRALS</span>
        </button>

        {/* NAV 4: PROFILE */}
        <button
          onClick={() => { playClickSound(); setActiveTab('profile'); }}
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === 'profile' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <User className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">PROFILE</span>
        </button>

      </footer>

      {/* INTERACTIVE RULES INFO MODAL */}
      <AnimatePresence>
        {showInfoModal && (
          <div id="modal_interaction_chart" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with transition */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClickSound(); setShowInfoModal(false); }}
              className="absolute inset-0 bg-black/75 backdrop-blur-xs"
            />
            
            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#17212b] border border-[#2b3745] rounded-3xl p-6 w-full max-w-sm relative z-10 shadow-2xl space-y-4"
            >
              {/* Heading Tab */}
              <div className="flex justify-between items-center pb-2 border-b border-[#242f3d]">
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-[#3390ec]" />
                  <h3 className="text-base font-bold text-white">Interactive Rules</h3>
                </div>
                <button
                  id="btn_close_info_modal_icon"
                  onClick={() => { playClickSound(); setShowInfoModal(false); }}
                  className="p-1 rounded-sm hover:bg-[#242f3d] text-[#708499] hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Rules Content */}
              <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
                <p>
                  <strong>Rock-Scissors-Paper-Well</strong> is an expanded edition of the standard game, incorporating the deep, strategic <strong>Well (🕳️)</strong> weapon.
                </p>
                
                <div className="space-y-2 pt-2 border-t border-[#242f3d]/60">
                  <span className="text-[10px] uppercase font-semibold text-[#708499] block tracking-wider">WEAPON OUTCOMES CHART:</span>
                  
                  <div className="grid grid-cols-1 gap-2 font-medium">
                    <div className="flex items-center bg-[#242f3d] p-2.5 rounded-xl gap-3">
                      <span className="text-2xl select-none">👊</span>
                      <div className="space-y-0.5">
                        <span className="text-white font-bold text-xs block">ROCK</span>
                        <span className="text-[10px] text-[#708499] block">Beats ✂️ Scissors. Loses to 📄 Paper & 🕳️ Well.</span>
                      </div>
                    </div>

                    <div className="flex items-center bg-[#242f3d] p-2.5 rounded-xl gap-3">
                      <span className="text-2xl select-none">✂️</span>
                      <div className="space-y-0.5">
                        <span className="text-white font-bold text-xs block">SCISSORS</span>
                        <span className="text-[10px] text-[#708499] block">Beats 📄 Paper. Loses to 👊 Rock & 🕳️ Well.</span>
                      </div>
                    </div>

                    <div className="flex items-center bg-[#242f3d] p-2.5 rounded-xl gap-3">
                      <span className="text-2xl select-none">📄</span>
                      <div className="space-y-0.5">
                        <span className="text-white font-bold text-xs block">PAPER</span>
                        <span className="text-[10px] text-[#708499] block">Beats 👊 Rock & 🕳️ Well. Loses to ✂️ Scissors.</span>
                      </div>
                    </div>

                    <div className="flex items-center bg-[#242f3d] p-2.5 rounded-xl gap-3">
                      <span className="text-2xl select-none">🕳️</span>
                      <div className="space-y-0.5">
                        <span className="text-white font-bold text-xs block">WELL</span>
                        <span className="text-[10px] text-[#708499] block">Beats 👊 Rock & ✂️ Scissors. Loses to 📄 Paper.</span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[9.5px] text-[#708499] text-center italic pt-1">
                  On-chain fair results verified. Pick carefully and outsmart your opponent!
                </p>
              </div>

              {/* Acknowledge Button */}
              <button
                id="btn_close_info_modal_got_it"
                onClick={() => { playClickSound(); setShowInfoModal(false); }}
                className="w-full py-2.5 bg-[#3390ec] hover:bg-[#2b7ad0] text-white font-bold rounded-xl transition text-xs shadow-md shadow-[#3390ec]/15 cursor-pointer"
              >
                GOT IT
              </button>
            </motion.div>
          </div>
        )}

        {showRankTiersModal && (
          <div id="modal_rank_tiers_showcase" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with transition */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClickSound(); setShowRankTiersModal(false); }}
              className="absolute inset-0 bg-black/85 backdrop-blur-xs"
            />
            
            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#17212b] border border-[#2b3745] rounded-3xl p-6 w-full max-w-sm relative z-10 shadow-2xl space-y-4"
            >
              {/* Heading */}
              <div className="flex justify-between items-center pb-2 border-b border-[#242f3d]">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-base font-bold text-white">Arena Rank Tiers</h3>
                </div>
                <button
                  id="btn_close_rank_tiers_modal"
                  onClick={() => { playClickSound(); setShowRankTiersModal(false); }}
                  className="p-1 rounded-sm hover:bg-[#242f3d] text-[#708499] hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tiers List */}
              <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                {RANKS.map((rk, idx) => {
                  const isCurrent = currentRank.name === rk.name;
                  const isUnlocked = userWins >= rk.minWins;

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between ${
                        isCurrent
                          ? `bg-white/5 border-white/20 ring-1 ring-white/10 shadow-lg`
                          : isUnlocked
                          ? `bg-[#242f3d]/40 border-[#2b3745]/30 opacity-75`
                          : `bg-black/20 border-[#2b3745]/10 opacity-35`
                      }`}
                    >
                      <div className="flex items-center space-x-3 w-[75%]">
                        <div className="w-10 h-10 rounded-xl bg-[#17212b] border border-white/5 flex items-center justify-center text-2xl shrink-0">
                          {rk.badgeEmoji}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold truncate ${rk.color} flex items-center gap-1`}>
                            {rk.name}
                            {isCurrent && (
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-1 py-[0.5px] rounded-sm font-semibold uppercase truncate shrink-0">
                                Active
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-white/50 truncate mt-0.5 leading-none">
                            {rk.description}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono block text-white/40">Requires</span>
                        <span className="text-xs font-bold font-mono text-emerald-400">{rk.minWins} W</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tips */}
              <p className="text-[10px] text-[#708499] text-center leading-normal">
                Winning games increases your status. Defeats do not decrease tier progress—it is permanently saved!
              </p>

              {/* Close Button */}
              <button
                id="btn_close_rank_tiers_modal_footer"
                onClick={() => { playClickSound(); setShowRankTiersModal(false); }}
                className="w-full py-2.5 bg-[#242f3d] hover:bg-[#2c394a] text-white font-bold rounded-xl transition text-xs border border-[#2b3745] cursor-pointer"
              >
                CLOSE VIEW
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function App() {
  const manifestUrl = typeof window !== 'undefined' ? `${window.location.origin}/tonconnect-manifest.json` : '';
  
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <GameAppInner />
    </TonConnectUIProvider>
  );
}
