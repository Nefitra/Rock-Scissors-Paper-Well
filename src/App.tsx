/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  playClickSound, 
  playWinChime, 
  playMatchmakingPing, 
  playDefeatSound,
  playMatchFoundSound,
  playCountdownSound,
  playRoundStartSound,
  playDrawSound,
  playReferralSound,
  playWalletConnectSound,
  playRewardXPSound,
  playNotificationSound
} from './sound';
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
  VolumeX,
  Layers,
  QrCode
} from 'lucide-react';
import WindowGame from './components/WindowGame';

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
  streak?: number;
  xp?: number;
  lastLoginDate?: string;
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
  
  // Tabs: 'home' | 'play' | 'leaderboard' | 'referrals' | 'profile' | 'admin' | 'windows'
  const [activeTab, setActiveTab ] = useState<'home' | 'play' | 'leaderboard' | 'referrals' | 'profile' | 'admin' | 'windows'>('home');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(false);
  
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
  
  // Daily Streak and XP state hooks
  const [claimingStreak, setClaimingStreak] = useState<boolean>(false);
  const [streakClaimSuccess, setStreakClaimSuccess] = useState<string | null>(null);

  // Live Game States
  const [activeGame, setActiveGame] = useState<GameSession | null>(null);
  const [selectedMove, setSelectedMove] = useState<string>('');
  const [preSelectedMove, setPreSelectedMove] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [countdownTick, setCountdownTick] = useState<number>(3);
  const [gameResultTimeout, setGameResultTimeout] = useState<any>(null);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showRankTiersModal, setShowRankTiersModal] = useState<boolean>(false);
  const [showReferralQrModal, setShowReferralQrModal] = useState<boolean>(false);
  const [promotedRank, setPromotedRank] = useState<RankConfig | null>(null);
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
  const lastMatchedGameIdRef = useRef<string | null>(null);
  const lastWalletAddressRef = useRef<string | null>(null);

  // Dynamic Player Ranks based on total wins
  const userWins = profile?.wins || 0;
  const currentRank = getPlayerRank(userWins);
  const nextRankInfo = getNextRank(userWins);

  // Rank Tier promotion tracking and confetti celebration
  useEffect(() => {
    if (profile) {
      const userWinsVal = profile.wins || 0;
      const calculatedRank = getPlayerRank(userWinsVal);
      const calculatedRankIndex = RANKS.findIndex(r => r.name === calculatedRank.name);
      const celebratedKey = `rspw_celebrated_rank_${currentTgId || 'anonymous'}`;
      const storedVal = localStorage.getItem(celebratedKey);

      if (storedVal === null) {
        // Initial setup on first profile fetch - mark existing level as celebrated
        localStorage.setItem(celebratedKey, String(calculatedRankIndex));
      } else {
        const previouslyCelebrated = parseInt(storedVal, 10);
        if (calculatedRankIndex > previouslyCelebrated) {
          // Promote! Save & show full screen visual dialog and animate confetti
          localStorage.setItem(celebratedKey, String(calculatedRankIndex));
          setPromotedRank(calculatedRank);
          
          // Trigger spectacular canvas-confetti sequence
          playWinChime();
          confetti({
            particleCount: 180,
            spread: 100,
            origin: { y: 0.55 },
            colors: ['#ffb703', '#fb8500', '#219ebc', '#8ecae6', '#ff006e', '#8338ec']
          });

          // Continuously fire side confetti bursts for 3 seconds
          const duration = 3000;
          const animationEnd = Date.now() + duration;
          const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

          const celebrationInterval = setInterval(() => {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) {
              return clearInterval(celebrationInterval);
            }

            const particleCount = 50 * (timeLeft / duration);
            // since particles fall down, start a bit higher than random
            confetti({
              particleCount,
              angle: randomInRange(55, 125),
              spread: randomInRange(50, 70),
              origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
            });
            confetti({
              particleCount,
              angle: randomInRange(55, 125),
              spread: randomInRange(50, 70),
              origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
            });
          }, 250);
        }
      }
    }
  }, [profile, currentTgId]);

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
        } else if (activeGame.winnerId === 'draw') {
          // Play neutral harmonized draw sound
          playDrawSound();
        } else {
          // Play soft custom synthesized warning/defeat sound
          playDefeatSound();
        }
      }
    }
  }, [activeGame, currentTgId]);

  // Trigger audio alert and immersive countdown sounds when matched with an opponent
  useEffect(() => {
    if (activeGame && activeGame.status === 'matched') {
      if (lastMatchedGameIdRef.current !== activeGame.id) {
        lastMatchedGameIdRef.current = activeGame.id;
        
        // 1. Play exciting Match Found arpeggio instantly
        playMatchFoundSound();
        
        // 2. Schedule crisp, snappy countdown alerts
        const p1 = setTimeout(() => {
          playCountdownSound(false); // Prepare piP
        }, 500);

        const p2 = setTimeout(() => {
          playCountdownSound(false); // Prepare piP
        }, 900);

        const p3 = setTimeout(() => {
          playCountdownSound(true); // "GO" High Tone!
        }, 1300);

        const p4 = setTimeout(() => {
          playRoundStartSound(); // Final impact clash of battle!
        }, 1350);

        return () => {
          clearTimeout(p1);
          clearTimeout(p2);
          clearTimeout(p3);
          clearTimeout(p4);
        };
      }
    }
  }, [activeGame]);

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

  // Helper to determine the active cosmetic badge based on current streak
  const getCosmeticBadge = (streakCount?: number) => {
    if (!streakCount || streakCount === 0) return null;
    if (streakCount >= 7) {
      return {
        emoji: "🔮",
        name: "Grand Phoenix",
        color: "text-[#f35588] bg-[#f35588]/10 border-[#f35588]/30",
        description: "Ultimate loyalty tier of master champions of RSPW (7+ Days)"
      };
    }
    if (streakCount >= 5) {
      return {
        emoji: "⚡",
        name: "Streak Overlord",
        color: "text-[#3390ec] bg-[#3390ec]/10 border-[#3390ec]/30",
        description: "Honored elite streak badge (5+ Days)"
      };
    }
    if (streakCount >= 3) {
      return {
        emoji: "👑",
        name: "Flame Adept",
        color: "text-amber-500 bg-amber-500/10 border-amber-500/30",
        description: "Combat veteran displaying consistent daily presence (3-4 Days)"
      };
    }
    return {
      emoji: "🔥",
      name: "Minor Sparkler",
      color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
      description: "Getting warmed up inside the daily arena (1-2 Days)"
    };
  };

  // Perform daily streak claiming with backend
  const claimDailyStreak = async () => {
    if (!currentTgId) return;
    setClaimingStreak(true);
    setStreakClaimSuccess(null);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const todayStr = new Date().toLocaleDateString('sv-SE'); // "YYYY-MM-DD" e.g. 2026-06-16

      const response = await fetch('/api/user/claim-daily', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          telegramId: currentTgId,
          clientDateString: todayStr
        })
      });
      const data = await response.json();
      if (data.error) {
        setErrorMessage(data.error);
      } else {
        // Trigger glorious confetti & sparkling XP/reward sound!
        playRewardXPSound();
        confetti({
          particleCount: 140,
          spread: 80,
          origin: { y: 0.6 }
        });

        setStreakClaimSuccess(data.message);
        // Refresh the profile to get updated level / xp / streak counts!
        syncProfile();
      }
    } catch (err: any) {
      console.error("Daily claim client error:", err);
      setErrorMessage("Could not claim daily reward due to network error.");
    } finally {
      setClaimingStreak(false);
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

  // Trigger futuristic sound feedback when wallet connects
  useEffect(() => {
    if (walletAddress && lastWalletAddressRef.current !== walletAddress) {
      playWalletConnectSound();
    }
    lastWalletAddressRef.current = walletAddress || null;
  }, [walletAddress]);

  // Unified Game Session Poller (handles searching queue, countdown progression, move selections, active resolving, and completing matches)
  useEffect(() => {
    if (!activeGame) return;
    if (activeGame.status === 'completed' || activeGame.status === 'canceled' || activeGame.status === 'cancelled') return;

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
  }, [activeGame?.id, activeGame?.status, currentTgId]);

  // Track countdown tick locally for fluid 1-second UI counting
  useEffect(() => {
    const arenaState = getArenaState();
    if (arenaState !== 'countdown') return;

    const interval = setInterval(() => {
      // Force local re-render to update Date.now() difference
      setCountdownTick(prev => (prev === 1 ? 1 : prev - 1));
    }, 250);

    return () => clearInterval(interval);
  }, [activeGame?.matchedAt, activeGame?.status]);

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

  // Fetch Global Leaderboard
  const fetchLeaderboard = async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (data.leaderboard) {
        setLeaderboard(data.leaderboard);
      }
    } catch (e) {
      console.error("Failed to fetch leaderboard:", e);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminMetrics();
    }
    if (activeTab === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [activeTab, currentTgId]);

  // Copy Referral link
  const handleCopyReferral = () => {
    const referralLink = `${window.location.origin}?startapp=${currentTgId}`;
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    playReferralSound();
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
        setIsSearching(false);
      }
    } catch (err) {
      setErrorMessage("Server matchmaking failure.");
      setIsSearching(false);
    }
  };

  // Cancel matchmaking queue
  const handleCancelMatchmaking = async () => {
    playClickSound();
    if (!activeGame) {
      setIsSearching(false);
      return;
    }
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }
      await fetch('/api/matchmaking/cancel', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          gameId: activeGame.id,
          userId: currentTgId
        })
      });
    } catch (err) {
      console.error("Error canceling matchmaking:", err);
    } finally {
      setActiveGame(null);
      setIsSearching(false);
      setSelectedMove('');
    }
  };

  // Forfeit/Leave Active match during gameplay
  const handleLeaveMatch = async () => {
    if (!activeGame) return;
    playClickSound();
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }
      const res = await fetch('/api/game/leave', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          gameId: activeGame.id,
          userId: currentTgId
        })
      });
      const data = await res.json();
      if (data && data.game) {
        setActiveGame(data.game);
        syncProfile();
      }
    } catch (err) {
      console.error("Error forfeiting match:", err);
    }
  };

  // Determines current state of the battle arena
  const getArenaState = (): 'idle' | 'searching' | 'countdown' | 'move_selection' | 'resolving' | 'completed' | 'cancelled' => {
    if (!activeGame) return 'idle';
    
    if (activeGame.status === 'searching') {
      return 'searching';
    }
    
    if (activeGame.status === 'cancelled' || activeGame.status === 'canceled') {
      return 'cancelled';
    }
    
    if (activeGame.status === 'completed') {
      return 'completed';
    }

    if (activeGame.status === 'matched') {
      // If it's a bot game, start move selection immediately 
      if (activeGame.player2Id === 'bot') {
        if (!selectedMove) return 'move_selection';
        return 'resolving';
      }

      // If PvP, countdown for 3 seconds based on matchedAt
      if (activeGame.matchedAt) {
        const elapsed = Date.now() - new Date(activeGame.matchedAt).getTime();
        if (elapsed < 3000) {
          return 'countdown';
        }
      }
      
      const amPlayer1 = activeGame.player1Id === currentTgId;
      const ourMoveSubmitted = amPlayer1 ? !!activeGame.player1Move : !!activeGame.player2Move;
      
      if (!ourMoveSubmitted) {
        return 'move_selection';
      } else {
        return 'resolving';
      }
    }

    if (activeGame.status === 'resolving' || activeGame.status === 'move_selection') {
      const amPlayer1 = activeGame.player1Id === currentTgId;
      const ourMoveSubmitted = amPlayer1 ? !!activeGame.player1Move : !!activeGame.player2Move;
      
      if (!ourMoveSubmitted) {
        return 'move_selection';
      } else {
        return 'resolving';
      }
    }

    return 'idle';
  };

  // Remaining seconds for PvP start countdown
  const getCountdownSecondsLeft = (): number => {
    if (!activeGame || !activeGame.matchedAt) return 0;
    const elapsed = Date.now() - new Date(activeGame.matchedAt).getTime();
    const remaining = Math.max(0, 3000 - elapsed);
    return Math.ceil(remaining / 1000);
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
    <div className="min-h-screen bg-[#0e1621] text-white flex flex-col font-sans selection:bg-[#3390ec] selection:text-white max-w-full overflow-x-hidden">
      
      {/* Dynamic Sandbox Controller for Testing (Only shown in Normal Web Browser / Outside Telegram) */}
      {!isInsideTMA && (
        <div className="bg-[#17212b] border-b border-[#242f3d] px-4 py-2.5 text-xs text-[#708499] md:flex md:items-center md:justify-between space-y-2 md:space-y-0 relative z-50 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-0.5 bg-[#3390ec]/10 text-[#3390ec] font-semibold rounded border border-[#2b3745]">
              TMA Play-Tester Panel
            </span>
            <span className="text-[10px] text-[#708499] whitespace-nowrap">
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
      <header className="bg-[#0e1621] border-b border-[#242f3d] shrink-0 sticky top-0 z-40">
        <div className="max-w-md mx-auto w-full px-5 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 bg-[#3390ec] rounded-xl flex items-center justify-center font-black text-lg text-white shrink-0">
              R
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-none text-white truncate">Rock Paper Well</h1>
              <p className="text-emerald-400 text-[9px] uppercase tracking-widest mt-0.5 font-bold">Real PvP Mode</p>
            </div>
          </div>
          
          {/* Real TON Connection Button */}
          <div id="ton-button-parent" className="scale-[0.82] origin-right flex items-center shrink-0">
            <div className="bg-[#242f3d]/60 rounded-full px-2 py-0.5 flex items-center border border-[#2b3745]">
              <TonConnectButton />
            </div>
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
              <div className="w-full">
                {/* TON Balance Card */}
                <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <p className="text-[#708499] text-[10px] font-bold uppercase tracking-widest leading-none">TON Balance</p>
                      {walletAddress ? (
                        <span className="text-[9px] text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full font-mono">
                          Connected
                        </span>
                      ) : (
                        <span className="text-[9px] text-[#708499] bg-[#242f3d] border border-[#2b3745] px-2 py-0.5 rounded-full font-mono">
                          Not Connected
                        </span>
                      )}
                    </div>
                    <div className="flex items-end space-x-1.5 mt-2.5">
                      <h3 className="text-3xl font-extrabold tracking-tight text-white leading-none">
                        {balanceLoading ? (
                           <RefreshCw className="animate-spin w-5 h-5 text-[#3390ec]" />
                        ) : walletAddress ? (
                          walletBalance
                        ) : (
                          "0.00"
                        )}
                      </h3>
                      <span className="text-[#3390ec] text-xs font-bold leading-none mb-0.5">TON</span>
                    </div>
                  </div>
                  {!walletAddress && (
                    <div className="mt-3.5 pt-3 border-t border-[#242f3d] flex justify-end">
                      <p className="text-[10px] text-amber-500 font-medium">Use header connection</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Daily Login Streak & XP Progression Card */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🔥</span>
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Daily Login Streak</h4>
                      <p className="text-[#708499] text-[10px]">Claim your daily experience bonus</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-mono font-bold bg-[#3390ec]/10 text-[#3390ec] px-2.5 py-0.5 rounded-full border border-[#3390ec]/20 animate-pulse">
                      {profile?.streak ? `${profile.streak} Day Streak` : '0 Day Streak'}
                    </span>
                  </div>
                </div>

                {/* 7-day reward ledger */}
                <div className="grid grid-cols-7 gap-1.5 pt-1.5 pb-1">
                  {Array.from({ length: 7 }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const currentStreak = profile?.streak || 0;
                    const isClaimedToday = profile?.lastLoginDate === new Date().toLocaleDateString('sv-SE');
                    
                    // Modulo logic for wrapping streaks larger than 7 cleanly
                    const currentWeekDay = currentStreak > 0 ? ((currentStreak - 1) % 7) + 1 : 0;
                    
                    const isCompleted = dayNum < currentWeekDay || (dayNum === currentWeekDay && isClaimedToday);
                    const isActiveTarget = !isClaimedToday && (
                      (dayNum === currentWeekDay + 1) || 
                      (currentWeekDay === 0 && dayNum === 1) ||
                      (currentWeekDay === 7 && dayNum === 1)
                    ) || (dayNum === currentWeekDay && !isClaimedToday);

                    const dayXpBonus = 100 + dayNum * 10;

                    return (
                      <div key={dayNum} className="flex flex-col items-center space-y-1.5">
                        <span className="text-[9px] text-[#708499] font-bold">D{dayNum}</span>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${
                          isCompleted
                            ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 border-amber-500 text-[#0e1621] shadow-sm shadow-amber-500/20'
                            : isActiveTarget
                              ? 'bg-[#3390ec]/20 border-[#3390ec] text-[#3390ec] animate-pulse scale-105'
                              : 'bg-[#242f3d]/60 border-[#2b3745] text-[#708499]'
                        }`}>
                          {isCompleted ? "🔥" : `+${dayXpBonus}`}
                        </div>
                        <span className={`text-[8px] font-mono scale-90 ${isCompleted ? 'text-amber-500 font-bold' : 'text-[#708499]'}`}>
                          {isCompleted ? "Done" : `${dayXpBonus} XP`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Claim Button & Info feedback */}
                <div>
                  {profile?.lastLoginDate === new Date().toLocaleDateString('sv-SE') ? (
                    <div className="bg-[#242f3d]/50 border border-[#2b3745] rounded-2xl p-3 text-center space-y-1">
                      <p className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                        <span>✅</span> Daily Bonus Claimed Today
                      </p>
                      <p className="text-[#708499] text-[10px]">
                        Return inside the next 24 hours to keep your streak burning!
                      </p>
                    </div>
                  ) : (
                    <button
                      disabled={claimingStreak}
                      onClick={claimDailyStreak}
                      className="w-full h-11 bg-gradient-to-r from-[#3390ec] to-indigo-600 hover:from-[#2b7ad0] hover:to-indigo-700 text-white font-bold rounded-2xl transition-all duration-150 active:scale-95 shadow-md shadow-[#3390ec]/10 flex items-center justify-center gap-2 cursor-pointer relative group overflow-hidden"
                    >
                      {claimingStreak ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <span>⚡</span>
                          <span>CLAIM TODAY'S REWARD</span>
                          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                            +{100 + (Math.min(7, (profile?.streak || 0) + 1) * 10)} XP
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Cosmetic Streak Badge Showcase (displays when streak >= 1) */}
                {profile?.streak && profile.streak > 0 ? (
                  (() => {
                    const badgeInfo = getCosmeticBadge(profile.streak);
                    if (!badgeInfo) return null;
                    return (
                      <div className="bg-[#242f3d]/30 border border-[#2b3745]/40 rounded-2xl p-3 flex items-center justify-between">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="text-2xl animate-bounce shrink-0">{badgeInfo.emoji}</span>
                          <div className="min-w-0">
                            <span className="text-[10px] text-[#708499] uppercase tracking-wider font-bold block">Active Streak Badge</span>
                            <span className="text-xs text-white font-bold block truncate">{badgeInfo.name}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shadow-sm ${badgeInfo.color}`}>
                            {badgeInfo.name === 'Grand Phoenix' ? 'MAX BADGE' : 'COSMETIC'}
                          </span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center text-[10px] text-[#708499]">
                    ℹ️ Maintain consecutive daily logins to unlock premium cosmetic badges.
                  </div>
                )}

                {/* Success Banner */}
                <AnimatePresence>
                  {streakClaimSuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl p-3 text-center text-xs font-semibold"
                    >
                      {streakClaimSuccess}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Dynamic Arena XP Progression Level bar */}
                <div className="border-t border-[#242f3d] pt-3.5 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-bold flex items-center gap-1">
                      <span>🔰</span> Level {Math.floor((profile?.xp || 0) / 1000) + 1} Arena Combatant
                    </span>
                    <span className="text-[#3390ec] font-mono font-bold">
                      {(profile?.xp || 0) % 1000} / 1000 XP
                    </span>
                  </div>
                  <div className="w-full bg-[#182533] rounded-full h-3 overflow-hidden p-[1px] border border-[#242f3d]">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-[#3390ec] via-indigo-500 to-purple-600 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, (((profile?.xp || 0) % 1000) / 1000) * 100))}%` }}
                    />
                  </div>
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

              {getArenaState() === 'idle' ? (
                // LOBBY ENTRY SCREEN
                <div className="space-y-6 animate-fade-in">
                  <div className="text-center py-6">
                    <h3 className="text-xl font-bold text-white">Find or Start a Match</h3>
                    <p className="text-[#708499] text-xs mt-1">Server resolves the game state atomically</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {/* Bot match */}
                    <button
                      onClick={() => handleStartLobby(true)}
                      className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl text-left transition-all flex items-center justify-between cursor-pointer"
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
                      className="group bg-[#17212b] hover:bg-[#3390ec] border border-[#242f3d] p-6 rounded-2xl text-left transition-all flex items-center justify-between relative overflow-hidden cursor-pointer"
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
                </div>
              ) : (
                // MATCHING & GAMEPLAY ACTIVE
                <div className="space-y-6">
                  {/* Matching Info Header */}
                  {activeGame && getArenaState() !== 'searching' && getArenaState() !== 'cancelled' && (
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
                  )}

                  {/* GAME ENGINE SCREEN */}
                  <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-8 text-center space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#3390ec] to-transparent opacity-50"></div>
                    
                    {getArenaState() === 'searching' && (
                      <div className="space-y-6 py-4 animate-fade-in">
                        <div className="relative inline-block">
                          <div className="w-16 h-16 rounded-full border-4 border-[#242f3d]/50 border-t-[#3390ec] animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Gamepad2 className="w-6 h-6 text-[#3390ec] animate-pulse" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-lg font-bold text-white uppercase tracking-wider animate-pulse">Waiting for Opponent...</h4>
                          <p className="text-[#708499] text-xs">Searching matchmaking queue. Real Multiplayer PvP matches require exactly two real Telegram players.</p>
                          <div className="flex items-center justify-center gap-1.5 mt-2 bg-[#242f3d]/40 py-1.5 px-3 rounded-xl max-w-xs mx-auto text-[11px] text-[#3390ec] font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                            <span>Queue Status: Active</span>
                          </div>
                        </div>
                        
                        <div className="pt-4 max-w-xs mx-auto">
                          <button
                            onClick={handleCancelMatchmaking}
                            className="w-full bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                          >
                            Cancel Matchmaking
                          </button>
                        </div>
                      </div>
                    )}

                    {getArenaState() === 'countdown' && (
                      <div className="space-y-6 py-6 animate-fade-in">
                        <span className="bg-[#3390ec]/10 text-[#3390ec] text-[10px] uppercase font-bold tracking-widest border border-[#3390ec]/30 px-3 py-1 rounded-full animate-pulse">
                          Match Starts In...
                        </span>
                        
                        <div className="relative py-4">
                          <motion.div
                            key={getCountdownSecondsLeft()}
                            initial={{ scale: 0.3, opacity: 0 }}
                            animate={{ scale: 1.2, opacity: 1 }}
                            exit={{ scale: 1.5, opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="text-7xl font-sans font-black tracking-tighter text-[#3390ec] drop-shadow-[0_0_25px_rgba(51,144,236,0.3)]"
                          >
                            {getCountdownSecondsLeft() > 0 ? getCountdownSecondsLeft() : "GO!"}
                          </motion.div>
                        </div>

                        <div>
                          <p className="text-white text-sm font-semibold">Prepare your stance carefully!</p>
                          <p className="text-[#708499] text-xs mt-0.5">Weapons are being unlocked shortly.</p>
                        </div>
                      </div>
                    )}

                    {getArenaState() === 'move_selection' && (
                      <div className="space-y-6 animate-fade-in">
                        <div>
                          <span className="bg-[#3390ec]/10 text-[#3390ec] text-[10px] uppercase font-bold tracking-widest border border-[#3390ec]/20 px-2.5 py-1 rounded-full">
                            Action Phase
                          </span>
                          <h4 className="text-xl font-bold text-white mt-3">Choose Your Weapon</h4>
                          <p className="text-[#708499] text-xs mt-0.5">Your move is processed and verified by the server</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <button
                            onClick={() => handleMakeMove('rock')}
                            className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl flex flex-col items-center transition-all cursor-pointer"
                          >
                            <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">👊</span>
                            <span className="font-bold text-sm text-white">ROCK</span>
                          </button>
                          <button
                            onClick={() => handleMakeMove('scissors')}
                            className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl flex flex-col items-center transition-all cursor-pointer"
                          >
                            <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">✂️</span>
                            <span className="font-bold text-sm text-white">SCISSORS</span>
                          </button>
                          <button
                            onClick={() => handleMakeMove('paper')}
                            className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl flex flex-col items-center transition-all cursor-pointer"
                          >
                            <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">📄</span>
                            <span className="font-bold text-sm text-white">PAPER</span>
                          </button>
                          <button
                            onClick={() => handleMakeMove('well')}
                            className="group bg-[#242f3d] hover:bg-[#3390ec] border border-[#2b3745] p-6 rounded-2xl flex flex-col items-center transition-all cursor-pointer"
                          >
                            <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">🕳️</span>
                            <span className="font-bold text-sm text-white">WELL</span>
                          </button>
                        </div>
                        
                        {activeGame && activeGame.player2Id !== 'bot' && (
                          <div className="pt-2 border-t border-[#242f3d]/60 max-w-xs mx-auto">
                            <button
                              onClick={handleLeaveMatch}
                              className="text-xs text-[#708499] hover:text-red-400 font-bold transition flex items-center justify-center gap-1 mx-auto cursor-pointer"
                            >
                              <span>Forfeit & Leave Match</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {getArenaState() === 'resolving' && (
                      <div className="space-y-6 py-6 animate-pulse">
                        <div className="inline-block relative">
                          <span className="text-6xl animate-bounce block">
                            {selectedMove === 'rock' && '👊'}
                            {selectedMove === 'scissors' && '✂️'}
                            {selectedMove === 'paper' && '📄'}
                            {selectedMove === 'well' && '🕳️'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-white text-base font-bold">Successfully Submitted {selectedMove.toUpperCase()}!</p>
                          <p className="text-[#708499] text-xs">Waiting for opponent to lock their weapon...</p>
                        </div>

                        {activeGame && activeGame.player2Id === 'bot' && (
                          <button
                            onClick={() => handleMakeMove(selectedMove)}
                            className="mt-3 text-xs bg-[#3390ec] hover:bg-[#2b7ad0] text-white px-5 py-2.5 rounded-full font-bold uppercase transition cursor-pointer"
                          >
                            Resolve Bot Fight
                          </button>
                        )}

                        {activeGame && activeGame.player2Id !== 'bot' && (
                          <div className="pt-4 border-t border-[#242f3d]/60 max-w-xs mx-auto">
                            <button
                              onClick={handleLeaveMatch}
                              className="w-full bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 py-2.5 px-4 rounded-xl text-xs font-bold uppercase transition cursor-pointer"
                            >
                              Forfeit Match
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {getArenaState() === 'completed' && activeGame && (
                      <div className="space-y-5 animate-fade-in">
                        <div>
                          <span className="bg-[#3390ec]/15 text-[#3390ec] text-[10px] uppercase font-bold tracking-widest border border-[#3390ec]/25 px-2.5 py-1 rounded-full">
                            Resolution Phase
                          </span>
                          
                          {activeGame.winnerId === 'draw' ? (
                            <h3 className="text-2xl font-bold text-amber-400 mt-4">It's a DRAW! 🤝</h3>
                          ) : activeGame.forfeitedBy ? (
                            activeGame.forfeitedBy === currentTgId ? (
                              <h3 className="text-2xl font-bold text-red-500 mt-4">YOU FORFEIT 💀</h3>
                            ) : (
                              <h3 className="text-2xl font-bold text-emerald-400 mt-4">W.O. VICTORY! 🎉</h3>
                            )
                          ) : activeGame.winnerId === currentTgId ? (
                            <h3 className="text-2xl font-bold text-emerald-400 mt-4">VICTORY! 🎉</h3>
                          ) : (
                            <h3 className="text-2xl font-bold text-red-400 mt-4">DEFEAT! 💀</h3>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 bg-[#242f3d] p-6 rounded-2xl border border-[#2b3745]">
                          <div className="text-center space-y-1">
                            <span className="text-[10px] text-[#708499] block font-semibold">Your Move</span>
                            <span className="text-5xl block py-2">
                              {activeGame.player1Id === currentTgId ? (
                                activeGame.player1Move === 'rock' ? '👊' : activeGame.player1Move === 'scissors' ? '✂️' : activeGame.player1Move === 'paper' ? '📄' : activeGame.player1Move === 'well' ? '🕳️' : '❓'
                              ) : (
                                activeGame.player2Move === 'rock' ? '👊' : activeGame.player2Move === 'scissors' ? '✂️' : activeGame.player2Move === 'paper' ? '📄' : activeGame.player2Move === 'well' ? '🕳️' : '❓'
                              )}
                            </span>
                            <span className="capitalize text-sm font-bold text-white">
                              {activeGame.player1Id === currentTgId ? (activeGame.player1Move || "No Move") : (activeGame.player2Move || "No Move")}
                            </span>
                          </div>

                          <div className="text-center space-y-1 border-l border-[#2b3745]">
                            <span className="text-[10px] text-[#708499] block font-semibold">Opponent Move</span>
                            <span className="text-5xl block py-2">
                              {activeGame.player1Id === currentTgId ? (
                                activeGame.player2Move === 'rock' ? '👊' : activeGame.player2Move === 'scissors' ? '✂️' : activeGame.player2Move === 'paper' ? '📄' : activeGame.player2Move === 'well' ? '🕳️' : '❓'
                              ) : (
                                activeGame.player1Move === 'rock' ? '👊' : activeGame.player1Move === 'scissors' ? '✂️' : activeGame.player1Move === 'paper' ? '📄' : activeGame.player1Move === 'well' ? '🕳️' : '❓'
                              )}
                            </span>
                            <span className="capitalize text-sm font-bold text-white">
                              {activeGame.player1Id === currentTgId ? (activeGame.player2Move || "No Move") : (activeGame.player1Move || "No Move")}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2">
                          <button
                            onClick={resetGameLobby}
                            className="bg-[#3390ec] hover:bg-[#2b7ad0] text-white font-bold w-full py-4 px-4 rounded-2xl transition shadow-lg shadow-[#3390ec]/20 cursor-pointer"
                          >
                            PLAY AGAIN
                          </button>
                        </div>
                      </div>
                    )}

                    {getArenaState() === 'cancelled' && (
                      <div className="space-y-6 py-4 animate-fade-in">
                        <div className="relative inline-block text-red-500">
                          <ShieldAlert className="w-16 h-16 mx-auto animate-bounce" />
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-lg font-bold text-white">Match Dissolved</h4>
                          <p className="text-[#708499] text-xs max-w-sm mx-auto">This battle was cancelled or dissolved because a player left the arena queue or failed to select their weapon.</p>
                        </div>
                        
                        <div className="pt-4 max-w-xs mx-auto">
                          <button
                            onClick={resetGameLobby}
                            className="w-full bg-[#3390ec] hover:bg-[#2b7ad0] text-white py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                          >
                            Return to Lobby
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB: GLOBAL LEADERBOARD */}
          {activeTab === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-6 select-none"
            >
              <div className="text-center py-4 relative flex flex-col items-center">
                <div className="w-16 h-16 bg-gradient-to-tr from-amber-400 to-yellow-600 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/15 mb-3.5 border border-amber-500/20 animate-pulse">
                  <Trophy className="w-8 h-8 text-black" />
                </div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Global Leaderboard</h3>
                <p className="text-xs text-[#708499] mt-1 max-w-[280px]">
                  The legendary top 10 warriors in the Rock Paper Scissors Well Arena. Updated in real time!
                </p>
                
                <button
                  id="btn_refresh_leaderboard"
                  onClick={() => { playClickSound(); fetchLeaderboard(); }}
                  disabled={leaderboardLoading}
                  className="absolute right-2 top-4 p-2.5 rounded-2xl bg-[#17212b] border border-[#242f3d] text-[#3390ec] hover:text-white transition cursor-pointer disabled:opacity-50"
                  title="Refresh Leaderboard"
                >
                  <RefreshCw className={`w-4 h-4 ${leaderboardLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {leaderboardLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="w-8 h-8 border-3 border-[#3390ec] border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-[#708499] font-mono">Fetching champions...</p>
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-8 text-center space-y-3">
                  <p className="text-[#708499] text-xs">No entries found yet.</p>
                  <p className="text-[10px] text-[#708499]/85">Be the first to secure a victory and claim the crown!</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {leaderboard.map((player, index) => {
                    const isTop3 = index < 3;
                    const rankNum = index + 1;
                    const isCurrentUser = player.telegramId === currentTgId;
                    
                    // Assign trophies/badges
                    let rankBadge = '';
                    let itemBg = 'bg-[#17212b]/60 border-[#242f3d]/50';
                    let rankColorClass = 'text-[#708499]';
                    
                    if (rankNum === 1) {
                      rankBadge = '🥇';
                      itemBg = 'bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/30';
                      rankColorClass = 'text-amber-400 font-extrabold';
                    } else if (rankNum === 2) {
                      rankBadge = '🥈';
                      itemBg = 'bg-gradient-to-r from-slate-400/10 to-transparent border-slate-400/30';
                      rankColorClass = 'text-slate-300 font-bold';
                    } else if (rankNum === 3) {
                      rankBadge = '🥉';
                      itemBg = 'bg-gradient-to-r from-amber-700/10 to-transparent border-amber-700/30';
                      rankColorClass = 'text-amber-600 font-bold';
                    }
                    
                    if (isCurrentUser) {
                      itemBg += ' ring-1 ring-[#3390ec]/60 border-[#3390ec]/50';
                    }

                    const playerRank = getPlayerRank(player.wins);
                    const winrate = player.gamesPlayed > 0 
                      ? Math.round((player.wins / player.gamesPlayed) * 100) 
                      : 0;

                    return (
                      <div
                        key={player.telegramId || index}
                        className={`border rounded-2.5xl p-4 flex items-center justify-between transition-all hover:scale-[1.01] ${itemBg}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Rank Display */}
                          <div className={`w-8 h-8 rounded-full bg-[#1e2c3a]/50 flex items-center justify-center text-xs font-bold leading-none ${rankColorClass}`}>
                            {isTop3 ? (
                              <span className="text-base">{rankBadge}</span>
                            ) : (
                              `#${rankNum}`
                            )}
                          </div>
                          
                          {/* Username & Title */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className={`text-xs font-bold truncate leading-tight ${isCurrentUser ? 'text-[#3390ec]' : 'text-white'}`}>
                                {player.username}
                              </p>
                              {isCurrentUser && (
                                <span className="bg-[#3390ec]/15 text-[#3390ec] text-[8px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded-sm shrink-0">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[9.5px] text-[#708499] mt-0.5">
                              <span>{playerRank.badgeEmoji}</span>
                              <span className="truncate max-w-[120px]">{playerRank.name}</span>
                            </div>
                          </div>
                        </div>

                        {/* Wins Count Statistics */}
                        <div className="text-right shrink-0">
                          <p className="text-xs font-black text-white font-mono leading-none">
                            {player.wins} <span className="text-[10px] font-bold text-[#708499] uppercase">W</span>
                          </p>
                          <p className="text-[9px] text-[#708499] font-mono leading-none mt-1">
                            {player.gamesPlayed} matches • {winrate}% WR
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Highlight current user status if not in top 10 */}
              {profile && !leaderboard.some(p => p.telegramId === currentTgId) && (
                <div className="bg-[#17212b]/40 border border-[#242f3d]/60 rounded-3xl p-4.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#1e2c3a]/80 flex items-center justify-center text-xs font-extrabold text-[#708499]">
                      Unranked
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Your Current Position</p>
                      <p className="text-[9.5px] text-[#708499] mt-0.5">Keep winning battles to place in the Top 10!</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-xs font-black text-[#3390ec] font-mono leading-none">
                      {profile.wins || 0} <span className="text-[10px] font-bold text-[#708499] uppercase">W</span>
                    </p>
                    <p className="text-[9px] text-[#708499] font-mono leading-none mt-1">
                      {profile.gamesPlayed || 0} matches
                    </p>
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
                    id="btn_view_referral_qr"
                    onClick={() => { playClickSound(); setShowReferralQrModal(true); }}
                    className="bg-[#242f3d] border border-[#2b3745] hover:bg-[#2c394a] text-[#3390ec] p-2.5 rounded-xl transition transform active:scale-95 flex items-center justify-center cursor-pointer"
                    title="View QR Code"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                  <button
                    id="btn_copy_referral_link"
                    onClick={handleCopyReferral}
                    className="bg-white text-black p-2.5 rounded-xl hover:bg-slate-200 transition transform active:scale-95 flex items-center justify-center cursor-pointer"
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
                    <p className="font-bold text-base leading-tight text-white flex items-center gap-1.5 break-all">
                      <span>@{currentTgId}</span>
                      {profile?.streak && profile.streak > 0 && (
                        <span 
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#3390ec]/15 text-[#3390ec] border border-[#3390ec]/20 inline-flex items-center gap-1 animate-pulse"
                          title={`Consecutive Streak: ${profile.streak} Days`}
                        >
                          🔥 {profile.streak}
                        </span>
                      )}
                    </p>
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

          {/* TAB 6: WINDOWS GAME */}
          {activeTab === 'windows' && (
            <motion.div
              key="windows"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              <WindowGame
                currentTgId={currentTgId}
                currentUsername={currentUsername}
                userWins={userWins}
                onRewardWins={async (amount) => {
                  try {
                    const headers: any = { 'Content-Type': 'application/json' };
                    const initData = (window as any).Telegram?.WebApp?.initData;
                    if (initData) {
                      headers['x-telegram-init-data'] = initData;
                    }
                    const res = await fetch('/api/user/reward-wins', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        telegramId: currentTgId,
                        amount: amount,
                        challengeId: 'multi_window_conversions_20'
                      })
                    });
                    const resData = await res.json();
                    if (resData.profile) {
                      setProfile(resData.profile);
                      confetti({
                        particleCount: 150,
                        spread: 80,
                        origin: { y: 0.6 }
                      });
                      playWinChime();
                    } else if (resData.error) {
                      setErrorMessage(resData.error);
                    }
                  } catch (e) {
                    console.error("Failed rewarding wins:", e);
                  }
                }}
                playClickSound={playClickSound}
                soundsMuted={soundsMuted}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Navigation Dock (Mobile-First 5 Tabs) */}
      <footer className="fixed bottom-0 left-0 right-0 h-20 bg-[#17212b] border-t border-[#242f3d] flex justify-around items-center px-1 max-w-md mx-auto w-full shadow-2xl z-40">
        
        {/* NAV 1: HOME */}
        <button
          onClick={() => { playClickSound(); setActiveTab('home'); }}
          className={`flex flex-col items-center justify-center w-11 h-14 rounded-2xl transition-all ${activeTab === 'home' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Home className="w-5 h-5 mb-1" />
          <span className="text-[9px] font-bold">HOME</span>
        </button>

        {/* NAV 2: PLAY */}
        <button
          onClick={() => { playClickSound(); setActiveTab('play'); }}
          className={`flex flex-col items-center justify-center w-11 h-14 rounded-2xl transition-all ${activeTab === 'play' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Gamepad2 className="w-5 h-5 mb-1" />
          <span className="text-[9px] font-bold">PLAY</span>
        </button>

        {/* NAV 3: LEADERBOARD */}
        <button
          id="btn_nav_leaderboard"
          onClick={() => { playClickSound(); setActiveTab('leaderboard'); }}
          className={`flex flex-col items-center justify-center w-11 h-14 rounded-2xl transition-all ${activeTab === 'leaderboard' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Trophy className="w-5 h-5 mb-1" />
          <span className="text-[9px] font-bold">BOARD</span>
        </button>


        {/* NAV 4: REFERRALS */}
        <button
          onClick={() => { playClickSound(); setActiveTab('referrals'); }}
          className={`flex flex-col items-center justify-center w-11 h-14 rounded-2xl transition-all ${activeTab === 'referrals' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Users className="w-5 h-5 mb-1" />
          <span className="text-[9px] font-bold">REFERRALS</span>
        </button>

        {/* NAV 5: PROFILE */}
        <button
          onClick={() => { playClickSound(); setActiveTab('profile'); }}
          className={`flex flex-col items-center justify-center w-11 h-14 rounded-2xl transition-all ${activeTab === 'profile' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <User className="w-5 h-5 mb-1" />
          <span className="text-[9px] font-bold">PROFILE</span>
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

        {promotedRank && (
          <div id="modal_rank_promotion_celebration" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with transition */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClickSound(); setPromotedRank(null); }}
              className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"
            />
            
            {/* Celebration Modal Box */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="bg-gradient-to-b from-[#182533] to-[#111921] border border-amber-500/40 rounded-3xl p-8 w-full max-w-sm relative z-10 shadow-2xl space-y-6 text-center select-none"
            >
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 flex items-center justify-center text-5xl shadow-xl animate-bounce">
                {promotedRank.badgeEmoji}
              </div>

              <div className="pt-8 space-y-2">
                <span className="text-[10px] text-amber-500 font-cyber font-black tracking-widest uppercase block">TIER PROMOTION</span>
                <h3 className={`text-2xl font-black tracking-tight leading-tight uppercase ${promotedRank.color.replace('animate-pulse', '')}`}>
                  {promotedRank.name}
                </h3>
                <p className="text-white/80 text-xs px-2">
                  {promotedRank.description}
                </p>
              </div>

              <div className="bg-black/35 rounded-2xl p-4 border border-white/5 space-y-1">
                <p className="text-[10px] text-[#708499]">PERMANENT REWARD UNLOCKED</p>
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-400">
                  <span>✨ Multiplier active in Matchmaking</span>
                </div>
              </div>

              <button
                id="btn_claim_promotion_celebration"
                onClick={() => { playClickSound(); setPromotedRank(null); }}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-extrabold rounded-xl transition text-xs tracking-wider uppercase cursor-pointer shadow-lg shadow-amber-500/10 active:scale-[0.98]"
              >
                CLAIM NEW TITLE
              </button>
            </motion.div>
          </div>
        )}

        {showReferralQrModal && (
          <div id="modal_referral_qr_code" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with transition */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClickSound(); setShowReferralQrModal(false); }}
              className="absolute inset-0 bg-black/80 backdrop-blur-xs"
            />
            
            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#17212b] border border-[#2b3745] rounded-3xl p-6 w-full max-w-xs relative z-10 shadow-2xl space-y-4 text-center"
            >
              {/* Header */}
              <div className="flex justify-between items-center pb-2 border-b border-[#242f3d]">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#3390ec]" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Referral QR Code</h3>
                </div>
                <button
                  id="btn_close_referral_qr_modal_x"
                  onClick={() => { playClickSound(); setShowReferralQrModal(false); }}
                  className="p-1 rounded-sm hover:bg-[#242f3d] text-[#708499] hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* QR Image Wrapper */}
              <div className="bg-white p-4 rounded-2xl flex items-center justify-center shadow-inner mx-auto w-[200px] h-[200px]">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}?startapp=${currentTgId}`)}`}
                  alt="Referral QR Code"
                  className="w-full h-full object-contain select-none shadow-sm rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Instructions */}
              <div className="space-y-1">
                <p className="text-xs font-bold text-white">Share App with Friends</p>
                <p className="text-[10px] text-[#708499] leading-relaxed">
                  Your friend can scan this using Telegram, their phone camera, or another QR scanner to start playing under your network!
                </p>
              </div>

              {/* Referral Link Quick Copy Box */}
              <button
                id="btn_modal_copy_referral_link"
                onClick={handleCopyReferral}
                className="w-full py-2 px-3 bg-[#242f3d] hover:bg-[#2c394a] rounded-xl flex items-center justify-between text-[11px] text-[#3390ec] font-mono border border-[#2b3745]/35 transition active:scale-[0.98] cursor-pointer"
              >
                <span className="truncate max-w-[150px]">{window.location.origin}?startapp={currentTgId}</span>
                <span className="font-sans font-bold text-[9px] uppercase text-white tracking-wider flex items-center gap-1 shrink-0 bg-[#3390ec] px-1.5 py-0.5 rounded-sm">
                  {copiedLink ? "COPIED" : "COPY"}
                </span>
              </button>

              {/* Close Button */}
              <button
                id="btn_close_referral_qr_modal"
                onClick={() => { playClickSound(); setShowReferralQrModal(false); }}
                className="w-full py-2.5 bg-[#242f3d]/60 hover:bg-[#242f3d] text-white font-bold rounded-xl transition text-xs border border-[#2b3745] cursor-pointer"
              >
                CLOSE WINDOW
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
