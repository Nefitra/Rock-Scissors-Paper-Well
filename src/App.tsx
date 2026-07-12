/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { detectLanguage, getTranslation, languageNames } from './lib/i18n';
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
  useTonWallet,
  useTonConnectUI
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
  QrCode,
  Bot,
  Award,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  Lock,
  Hourglass
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
  vViral?: number;
  lastLoginDate?: string;
  missions?: Record<string, {
    progress: number;
    completed: boolean;
    claimed: boolean;
    lastUpdated?: string;
  }>;
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
  mode?: string;   // "free" | "stake"
  stake?: number;  // amount of vVIRAL staked
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
  matchmakingQueue?: any[];
  matchmakingStats?: {
    usersWaiting: number;
    avgQueueAgeSec: number;
    matchedPairsCount: number;
    activeMatchesCount: number;
    expiredCount: number;
    failedTransactionsCount: number;
    cloudRunRevision: string;
  };
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

const getLocalizedRankName = (name: string, lang: string) => {
  const mapping: Record<string, Record<string, string>> = {
    "Bronze Novice": {
      "en": "Bronze Novice",
      "zh-CN": "青铜新手",
      "es": "Novato de Bronce",
      "ru": "Бронзовый новичок",
      "de": "Bronze-Novize",
      "fr": "Novice de Bronze",
      "pt": "Novato de Bronze",
      "ja": "ブロンズの初心者",
      "hi": "कांस्य नौसिखिया",
      "tr": "Bronz Çaylak",
      "id": "Pemula Perunggu",
      "ar": "مبتدئ برونزي"
    },
    "Silver Gladiator": {
      "en": "Silver Gladiator",
      "zh-CN": "白银角斗士",
      "es": "Gladiador de Plata",
      "ru": "Серебряный гладиатор",
      "de": "Silber-Gladiator",
      "fr": "Gladiateur d'Argent",
      "pt": "Gladiador de Prata",
      "ja": "シルバーグラディエーター",
      "hi": "रजत योद्धा",
      "tr": "Gümüş Gladyatör",
      "id": "Gladiator Perak",
      "ar": "المبارز الفضي"
    },
    "Gold Elite": {
      "en": "Gold Elite",
      "zh-CN": "黄金精英",
      "es": "Élite de Oro",
      "ru": "Золотая элита",
      "de": "Gold-Elite",
      "fr": "Élite d'Or",
      "pt": "Elite de Ouro",
      "ja": "ゴールドエリート",
      "hi": "स्वर्ण विशिष्ट",
      "tr": "Altın Elit",
      "id": "Elite Emas",
      "ar": "النخبة الذهبية"
    },
    "Platinum Legend": {
      "en": "Platinum Legend",
      "zh-CN": "白金传奇",
      "es": "Leyenda de Platino",
      "ru": "Платиновая легенда",
      "de": "Platin-Legende",
      "fr": "Légende de Platine",
      "pt": "Lenda de Platina",
      "ja": "プラチナレジェンド",
      "hi": "प्लेटिनम किंवदंती",
      "tr": "Platin Efsane",
      "id": "Legenda Platinum",
      "ar": "الأسطورة البلاتينية"
    },
    "RSPW Grand Master": {
      "en": "RSPW Grand Master",
      "zh-CN": "RSPW 大师",
      "es": "Gran Maestro RSPW",
      "ru": "Гранд-мастер RSPW",
      "de": "RSPW-Großmeister",
      "fr": "Grand Maître RSPW",
      "pt": "Grão-Mestre RSPW",
      "ja": "RSPWグランドマスター",
      "hi": "RSPW ग्रैंड मास्टर",
      "tr": "RSPW Büyük Ustası",
      "id": "Grand Master RSPW",
      "ar": "الأستاذ الكبير لـ RSPW"
    }
  };
  return mapping[name]?.[lang] || name;
};

const getLocalizedRankDesc = (desc: string, lang: string) => {
  const mapping: Record<string, Record<string, string>> = {
    "Beginner taking their first arena steps": {
      "en": "Beginner taking their first arena steps",
      "zh-CN": "迈出竞技场第一步的新手",
      "es": "Principiante dando sus primeros pasos en la arena",
      "ru": "Новичок, делающий первые шаги на арене",
      "de": "Anfänger, der seine ersten Schritte in der Arena macht",
      "fr": "Débutant faisant ses premiers pas dans l'arène",
      "pt": "Iniciante dando seus primeiros passos na arena",
      "ja": "アリーナへの第一歩を踏み出す初心者",
      "hi": "एरीना में अपना पहला कदम रखने वाला नौसिखिया",
      "tr": "Arenada ilk adımlarını atan yeni başlayan",
      "id": "Pemula yang mengambil langkah pertama di arena",
      "ar": "مبتدئ يخطو خطواته الأولى في الساحة"
    },
    "Experienced combatant with proven skill": {
      "en": "Experienced combatant with proven skill",
      "zh-CN": "拥有丰富战斗经验和实力证明的战士",
      "es": "Combatiente experimentado con habilidad probada",
      "ru": "Опытный боец с проверенными навыками",
      "de": "Erfahrener Kämpfer mit bewiesener Stärke",
      "fr": "Combattant expérimenté aux compétences prouvées",
      "pt": "Combatente experiente com habilidade comprovada",
      "ja": "実績のある実力派ファイター",
      "hi": "प्रमाणित कौशल के साथ अनुभवी योद्धा",
      "tr": "Kanıtlanmış becerilere sahip deneyimli savaşçı",
      "id": "Pejuang berpengalaman dengan keterampilan terbukti",
      "ar": "مقاتل ذو خبرة ومهارات مثبتة"
    },
    "Master tactician of rock-paper-scissors": {
      "en": "Master tactician of rock-paper-scissors",
      "zh-CN": "剪刀石头布大师级战术家",
      "es": "Maestro táctico de piedra, papel o tijera",
      "ru": "Мастер тактики в камень-ножницы-бумага",
      "de": "Meister-Taktiker von Schere, Stein, Papier",
      "fr": "Maître tacticien de pierre-feuille-ciseaux",
      "pt": "Mestre tático de pedra, papel e tesoura",
      "ja": "ジャンケンの戦術マスター",
      "hi": "रॉक-पेपर-कैंची का मास्टर रणनीतिकार",
      "tr": "Taş-kağıt-makas taktik ustası",
      "id": "Taktisi ulung batu-kertas-gunting",
      "ar": "قائد تكتيكي بارع في حجر-ورقة-مقص"
    },
    "Renowned grandmaster dominating the scene": {
      "en": "Renowned grandmaster dominating the scene",
      "zh-CN": "称霸全场的著名大宗师",
      "es": "Gran maestro de renombre dominando la escena",
      "ru": "Знаменитый гроссмейстер, доминирующий на арене",
      "de": "Renommierter Großmeister, der die Arena dominiert",
      "fr": "Grand maître de renom dominant la scène",
      "pt": "Grão-mestre renomado dominando a cena",
      "ja": "アリーナを支配する著名なグランドマスター",
      "hi": "पूरी दुनिया पर राज करने वाला प्रसिद्ध ग्रैंडमास्टर",
      "tr": "Ortalığı kasıp kavuran ünlü büyük usta",
      "id": "Grand master terkenal yang mendominasi arena",
      "ar": "أستاذ كبير مشهور يسيطر على الساحة"
    },
    "A godlike champion tier of supreme reflexes": {
      "en": "A godlike champion tier of supreme reflexes",
      "zh-CN": "拥有至高反射神经的半神级冠军殿堂",
      "es": "Nivel de campeón divino con reflejos supremos",
      "ru": "Божественный чемпион с превосходными рефлексами",
      "de": "Göttergleiche Champion-Stufe mit extremen Reflexen",
      "fr": "Champion divin aux réflexes suprêmes",
      "pt": "Campeão supremo com reflexos divinos",
      "ja": "至高の反射神経を持つ神のごときチャンピオン",
      "hi": "सर्वोच्च सजगता वाला दिव्य चैंपियन स्तर",
      "tr": "Üstün reflekslere sahip yarı tanrı şampiyon seviyesi",
      "id": "Tingkat juara seperti dewa dengan refleks tertinggi",
      "ar": "رتبة بطل أسطوري ذو ردود أفعال خارقة"
    }
  };
  return mapping[desc]?.[lang] || desc;
};

const getBeatsText = (weapon1: string, weapon2: string, lang: string) => {
  const translations: Record<string, string> = {
    'en': `${weapon1} beats ${weapon2}`,
    'zh-CN': `${weapon1} 击败 ${weapon2}`,
    'es': `${weapon1} vence a ${weapon2}`,
    'ru': `${weapon1} побеждает ${weapon2}`,
    'de': `${weapon1} schlägt ${weapon2}`,
    'fr': `${weapon1} bat ${weapon2}`,
    'pt': `${weapon1} vence ${weapon2}`,
    'ja': `${weapon1} は ${weapon2} に勝つ`,
    'hi': `${weapon1}, ${weapon2} को हराता है`,
    'tr': `${weapon1}, ${weapon2} silahını yener`,
    'id': `${weapon1} mengalahkan ${weapon2}`,
    'ar': `${weapon1} يهزم ${weapon2}`
  };
  return translations[lang] || `${weapon1} beats ${weapon2}`;
};

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

const ADMIN_TELEGRAM_IDS = ["beskerboris", "admin", "123456789", "711279376", "525364261"];

const getUniqueGuestId = (): string => {
  if (typeof window === 'undefined') return 'sandbox_guest';
  let storedId = localStorage.getItem('rpsw_guest_id');
  if (!storedId) {
    storedId = 'guest_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('rpsw_guest_id', storedId);
  }
  return storedId;
};

const getUniqueGuestUsername = (): string => {
  if (typeof window === 'undefined') return 'SandboxGuest';
  let storedUsername = localStorage.getItem('rpsw_guest_username');
  if (!storedUsername) {
    const adjectives = ['Cyber', 'Mega', 'Ton', 'Super', 'Hyper', 'Sonic', 'Crypto', 'Alpha', 'Delta', 'Zero'];
    const nouns = ['Player', 'Gamer', 'Champ', 'Pro', 'Ninja', 'Rival', 'Rider', 'Fighter', 'Winner', 'Star'];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(100 + Math.random() * 900);
    storedUsername = `${randomAdj}${randomNoun}${num}`;
    localStorage.setItem('rpsw_guest_username', storedUsername);
  }
  return storedUsername;
};

const sanitizeUserId = (id: string): string => {
  if (!id) return "";
  const trimmed = id.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.toLowerCase();
};

function GameAppInner() {
  const walletAddress = useTonAddress();
  const wallet = useTonWallet();

  const [currentLanguage, setCurrentLanguage] = useState<string>(() => detectLanguage());
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isRtl = currentLanguage === 'ar';
      document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
      document.documentElement.lang = currentLanguage;
    }
  }, [currentLanguage]);

  useEffect(() => {
    return () => {
      if (depositIntervalRef.current) {
        clearInterval(depositIntervalRef.current);
      }
    };
  }, []);

  const t = (key: string, params?: Record<string, any>) => getTranslation(currentLanguage, key, params);
  
  // Tabs: 'home' | 'play' | 'leaderboard' | 'referrals' | 'profile' | 'admin' | 'windows' | 'missions'
  const [activeTab, setActiveTab ] = useState<'home' | 'play' | 'leaderboard' | 'referrals' | 'profile' | 'admin' | 'windows' | 'missions'>('home');
  const [selectedLobbyMode, setSelectedLobbyMode] = useState<'free' | 'stake' | 'ton'>('free');
  const [selectedLobbyStake, setSelectedLobbyStake] = useState<number>(50);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(false);

  // Feature flag & TON configuration
  const ENABLE_TON_GAME_MODE = true;
  const [tonConnectUI] = useTonConnectUI();
  const [tonConfig, setTonConfig] = useState<any>({
    network: 'mainnet',
    treasuryAddress: '',
    pauseDeposits: false,
    pauseGames: false,
    pauseWithdrawals: false
  });
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [showTonHistoryModal, setShowTonHistoryModal] = useState<boolean>(false);
  
  const [depositAmount, setDepositAmount] = useState<string>('1');
  const [depositLoading, setDepositLoading] = useState<boolean>(false);
  const [depositPendingId, setDepositPendingId] = useState<string | null>(null);
  const [depositPendingStatus, setDepositPendingStatus] = useState<string>('');
  const [depositVerifyError, setDepositVerifyError] = useState<string | null>(null);
  const [depositMessage, setDepositMessage] = useState<string>('');
  const [depositTreasuryAddress, setDepositTreasuryAddress] = useState<string>('');
  const [depositAmountNano, setDepositAmountNano] = useState<string>('');
  const [depositPolling, setDepositPolling] = useState<boolean>(false);
  const [floatingNotification, setFloatingNotification] = useState<string | null>(null);
  const depositIntervalRef = useRef<any>(null);
  
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawLoading, setWithdrawLoading] = useState<boolean>(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const [tonHistory, setTonHistory] = useState<any[]>([]);
  const [tonHistoryLoading, setTonHistoryLoading] = useState<boolean>(false);
  
  // Simulation / Sandbox Controls (for developer testing outside Telegram)
  const isDevelopEnvironment = typeof window !== 'undefined' && (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === 'true' || params.get('dev') === 'true' || params.get('admin') === 'true' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  })();

  const isInsideTMA = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;
  const [simulatedTgId, setSimulatedTgId] = useState<string>(() => getUniqueGuestId());
  const [simulatedUsername, setSimulatedUsername ] = useState<string>(() => getUniqueGuestUsername());
  const [refParam, setRefParam] = useState<string>('');
  
  // Real or Simulated final credentials (all string ids are normalized case insensitively via sanitizeUserId)
  const rawTgId = isInsideTMA 
    ? (((window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString()) || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.username || simulatedTgId) 
    : simulatedTgId;
  const currentTgId = sanitizeUserId(rawTgId);

  const currentUsername = isInsideTMA 
    ? ((window as any).Telegram?.WebApp?.initDataUnsafe?.user?.first_name || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.username || simulatedUsername) 
    : simulatedUsername;

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

  // Global Configured TG Settings
  const [globalSettings, setGlobalSettings] = useState<{ botUsername: string; appName: string; webUrl: string }>({
    botUsername: "RpsRockPaperBot",
    appName: "play",
    webUrl: ""
  });
  const [settingsBotUsername, setSettingsBotUsername] = useState<string>('');
  const [settingsAppName, setSettingsAppName] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsSaveSuccess, setSettingsSaveSuccess] = useState<string | null>(null);
  const [adminSuccessMessage, setAdminSuccessMessage] = useState<string | null>(null);
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

  const getTonValue = (nano: any) => {
    if (nano === undefined || nano === null) return '0.00';
    const val = typeof nano === 'string' ? parseFloat(nano) : Number(nano);
    return (val / 1e9).toFixed(2);
  };

  const handleFetchTonHistory = async () => {
    setShowTonHistoryModal(true);
    setTonHistoryLoading(true);
    try {
      const headers: any = {};
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }
      const response = await fetch('/api/ton/history', { headers });
      const data = await response.json();
      if (data.history) {
        setTonHistory(data.history);
      }
    } catch (err) {
      console.error("Error fetching TON history:", err);
    } finally {
      setTonHistoryLoading(false);
    }
  };

  const buildTextCommentBoc = (comment: string): string => {
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(comment);
    
    // Total bits of data: (4 bytes zero prefix + text length) * 8
    const dataLen = 4 + textBytes.length;
    
    const d1 = 0;
    const d2 = dataLen * 2;
    
    const cellData = new Uint8Array(2 + dataLen);
    cellData[0] = d1;
    cellData[1] = d2;
    cellData[2] = 0;
    cellData[3] = 0;
    cellData[4] = 0;
    cellData[5] = 0;
    cellData.set(textBytes, 6);
    
    const header = new Uint8Array([
      0xb5, 0xee, 0x9c, 0x72, // magic
      0x01,                   // flags (size_bytes=1)
      0x01,                   // off_bytes=1
      0x01,                   // cells=1
      0x01,                   // roots=1
      0x00,                   // absent=0
      cellData.length,        // tot_cells_size
      0x00                    // root_idx=0
    ]);
    
    const boc = new Uint8Array(header.length + cellData.length);
    boc.set(header, 0);
    boc.set(cellData, header.length);
    
    let binary = '';
    const len = boc.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(boc[i]);
    }
    return btoa(binary);
  };

  const handleCreateDepositIntent = async () => {
    if (!wallet || !walletAddress) {
      setDepositVerifyError("Please connect your wallet first.");
      return;
    }
    const targetChainId = tonConfig?.network === 'mainnet' ? "-239" : "-3";
    if (wallet.account.chain !== targetChainId) {
      if (tonConfig?.network === 'mainnet') {
        setDepositVerifyError("Please switch your wallet to TON Mainnet.");
      } else {
        setDepositVerifyError("Please switch your wallet to TON Testnet.");
      }
      return;
    }

    setDepositLoading(true);
    setDepositVerifyError(null);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }
      const res = await fetch('/api/ton/deposit/intent', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          amount: parseFloat(depositAmount),
          walletAddress: walletAddress
        })
      });
      const data = await res.json();
      if (data.error) {
        setDepositVerifyError(data.error);
      } else if (data.success && data.depositId) {
        setDepositPendingId(data.depositId);
        setDepositAmountNano(String(data.amountNano));
        setDepositMessage(data.payload);
        setDepositTreasuryAddress(data.treasuryAddress);
        setDepositPendingStatus('awaiting_payment');
      } else if (data.intent) {
        setDepositPendingId(data.intent.id);
        setDepositAmountNano(String(data.intent.amountNano));
        setDepositMessage(data.intent.message);
        setDepositTreasuryAddress(data.intent.treasuryAddress);
        setDepositPendingStatus('awaiting_payment');
      }
    } catch (e: any) {
      setDepositVerifyError(e.message);
    } finally {
      setDepositLoading(false);
    }
  };

  const startDepositPolling = (pendingId: string, amount: string) => {
    if (depositIntervalRef.current) {
      clearInterval(depositIntervalRef.current);
    }

    // Persist pending deposit in localStorage for automatic recovery after app restart (Requirement 7)
    localStorage.setItem('pending_deposit_id', pendingId);
    localStorage.setItem('pending_deposit_amount', amount);
    localStorage.setItem('pending_deposit_amount_nano', depositAmountNano || '');
    localStorage.setItem('pending_deposit_message', depositMessage || '');
    localStorage.setItem('pending_deposit_treasury', depositTreasuryAddress || '');

    setDepositPolling(true);
    setDepositVerifyError(null);
    setDepositPendingStatus('verifying');

    const startTime = Date.now();
    const durationLimit = 120 * 1000; // 120 seconds maximum polling duration (Requirement 6)
    let consecutiveServerErrors = 0;

    depositIntervalRef.current = setInterval(async () => {
      // 120 seconds timeout limit check (Requirement 6)
      if (Date.now() - startTime >= durationLimit) {
        if (depositIntervalRef.current) {
          clearInterval(depositIntervalRef.current);
          depositIntervalRef.current = null;
        }
        setDepositPolling(false);
        setDepositPendingStatus('timeout');
        setDepositVerifyError(
          `⚠️ Deposit processing is taking longer than expected.\nYour TON has reached the platform wallet.\nThe transaction will continue processing automatically.\nReference: ${pendingId}`
        );
        return;
      }

      try {
        const headers: any = { 'Content-Type': 'application/json' };
        const initData = (window as any).Telegram?.WebApp?.initData;
        if (initData) {
          headers['x-telegram-init-data'] = initData;
        }
        const url = `/api/ton/deposits/${pendingId}/verify`;
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ simulateOnChain: false })
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        consecutiveServerErrors = 0; // Reset on successful server response

        if (data.success && (data.status === 'confirmed' || data.status === 'credited' || data.status === 'completed')) {
          if (depositIntervalRef.current) {
            clearInterval(depositIntervalRef.current);
            depositIntervalRef.current = null;
          }
          setDepositPolling(false);
          setDepositPendingStatus('completed');
          playNotificationSound();
          playRewardXPSound();
          
          // Refresh user profile immediately to update Game Balance (Requirement 5)
          syncProfile();
          
          // Refresh TON History in the background (Requirement 5)
          try {
            const histRes = await fetch('/api/ton/history', { headers });
            const histData = await histRes.json();
            if (histData.history) {
              setTonHistory(histData.history);
            }
          } catch (hErr) {
            console.error("History refresh error:", hErr);
          }

          // Clear localStorage on successful credit (Requirement 7)
          localStorage.removeItem('pending_deposit_id');
          localStorage.removeItem('pending_deposit_amount');
          localStorage.removeItem('pending_deposit_amount_nano');
          localStorage.removeItem('pending_deposit_message');
          localStorage.removeItem('pending_deposit_treasury');

          // Close deposit dialog automatically (Requirement 5)
          setShowDepositModal(false);
          setDepositPendingId(null);
          
          // Display success notification (Requirement 5)
          const formattedAmount = parseFloat(amount).toFixed(2);
          setFloatingNotification(
            `✅ Deposit credited\n${formattedAmount} TON was added to your Game Balance.`
          );
          setTimeout(() => {
            setFloatingNotification(null);
          }, 8000);
        } else if (data.status === 'failed' || data.status === 'rejected') {
          // Stop polling on terminal failed/rejected status (Requirement 5)
          if (depositIntervalRef.current) {
            clearInterval(depositIntervalRef.current);
            depositIntervalRef.current = null;
          }
          setDepositPolling(false);
          setDepositPendingStatus('failed');
          setDepositVerifyError(data.error || "Deposit verification failed or was rejected.");
          
          // Clear localStorage on terminal failure (Requirement 7)
          localStorage.removeItem('pending_deposit_id');
          localStorage.removeItem('pending_deposit_amount');
          localStorage.removeItem('pending_deposit_amount_nano');
          localStorage.removeItem('pending_deposit_message');
          localStorage.removeItem('pending_deposit_treasury');
        }
      } catch (err: any) {
        console.error("Polling verify error:", err);
        consecutiveServerErrors++;
        // Show an error after repeated server failures (Requirement 5)
        if (consecutiveServerErrors >= 5) {
          if (depositIntervalRef.current) {
            clearInterval(depositIntervalRef.current);
            depositIntervalRef.current = null;
          }
          setDepositPolling(false);
          setDepositPendingStatus('failed');
          setDepositVerifyError(
            "⚠️ Persistent connection issues with the server.\nWe have paused verification checks.\nYour TON is safe, and checking will resume automatically when you refresh the app."
          );
        }
      }
    }, 2500);
  };

  const handleVerifyDeposit = async (simulateOnChain = false) => {
    if (!depositPendingId) {
      setDepositVerifyError("No pending deposit to verify.");
      return;
    }
    setDepositLoading(true);
    setDepositVerifyError(null);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }
      const url = `/api/ton/deposits/${depositPendingId}/verify`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          simulateOnChain: simulateOnChain
        })
      });
      const data = await res.json();
      if (data.error) {
        setDepositVerifyError(data.error);
      } else if (data.success && (data.status === 'confirmed' || data.status === 'credited' || data.status === 'completed')) {
        if (depositIntervalRef.current) {
          clearInterval(depositIntervalRef.current);
          depositIntervalRef.current = null;
        }
        setDepositPolling(false);
        setDepositPendingStatus('completed');
        playNotificationSound();
        playRewardXPSound();
        syncProfile();
        
        setShowDepositModal(false);
        setDepositPendingId(null);
        setFloatingNotification(
          `✅ ${depositAmount} TON credited successfully`
        );
        setTimeout(() => {
          setFloatingNotification(null);
        }, 6000);
      } else if (data.status === 'completed' || data.status === 'confirmed' || data.status === 'credited') {
        if (depositIntervalRef.current) {
          clearInterval(depositIntervalRef.current);
          depositIntervalRef.current = null;
        }
        setDepositPolling(false);
        setDepositPendingStatus('completed');
        playNotificationSound();
        playRewardXPSound();
        syncProfile();
        
        setShowDepositModal(false);
        setDepositPendingId(null);
        setFloatingNotification(
          `✅ ${depositAmount} TON credited successfully`
        );
        setTimeout(() => {
          setFloatingNotification(null);
        }, 6000);
      } else if (data.ok && data.status === 'pending') {
        setDepositVerifyError(data.message || "Transaction not detected yet.");
      } else {
        setDepositVerifyError("Transaction not found on-chain yet. Please wait a moment and try again.");
      }
    } catch (e: any) {
      setDepositVerifyError(e.message);
    } finally {
      setDepositLoading(false);
    }
  };

  const handleRequestWithdrawal = async () => {
    if (!wallet || !walletAddress) {
      setWithdrawError("Please connect your wallet first.");
      return;
    }
    const targetChainId = tonConfig?.network === 'mainnet' ? "-239" : "-3";
    if (wallet.account.chain !== targetChainId) {
      if (tonConfig?.network === 'mainnet') {
        setWithdrawError("Please switch your wallet to TON Mainnet.");
      } else {
        setWithdrawError("Please switch your wallet to TON Testnet.");
      }
      return;
    }

    setWithdrawLoading(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }
      const res = await fetch('/api/ton/withdrawal/request', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: parseFloat(withdrawAmount),
          walletAddress: walletAddress
        })
      });
      const data = await res.json();
      if (data.error) {
        setWithdrawError(data.error);
      } else {
        setWithdrawSuccess(`Success! Your withdrawal request of ${withdrawAmount} TON has been submitted and is processing.`);
        setWithdrawAmount('');
        syncProfile();
      }
    } catch (e: any) {
      setWithdrawError(e.message);
    } finally {
      setWithdrawLoading(false);
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
  const isUserAnAdmin = ADMIN_TELEGRAM_IDS.includes(String(currentTgId).toLowerCase());
  const [adminModeEnabled, setAdminModeEnabled] = useState<boolean>(isDevelopEnvironment || isUserAnAdmin);

  const [announcementText, setAnnouncementText] = useState<string>('');
  const [announcementLoading, setAnnouncementLoading] = useState<boolean>(false);
  const [announcementSuccess, setAnnouncementSuccess] = useState<string | null>(null);

  const [pinningLoading, setPinningLoading] = useState<boolean>(false);
  const [pinningSuccess, setPinningSuccess] = useState<string | null>(null);

  const [cancelLoading, setCancelLoading] = useState<boolean>(false);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);

  // Fetch Referral Code from URL or WebApp start_param on boot (survives page reloads)
  const handleJoinSpecificDuel = async (challengeId: string) => {
    setIsSearching(true);
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
          challengeId: challengeId
        })
      });
      const data = await res.json();
      if (data.error) {
        setErrorMessage(data.error);
        setIsSearching(false);
      } else {
        setActiveGame(data.game);
        setActiveTab('play');
        setIsSearching(false);
      }
    } catch (err) {
      setErrorMessage("Could not join duel challenge.");
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let code = params.get('startapp') || params.get('tgWebAppStartParam') || params.get('route') || params.get('ref') || (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param || '';
    if (code) {
      const normalizedCode = code.toLowerCase().trim();
      if (normalizedCode === 'arena') {
        setActiveTab('play');
      } else if (normalizedCode === 'missions') {
        setActiveTab('missions');
      } else if (normalizedCode === 'leaderboard') {
        setActiveTab('leaderboard');
      } else if (normalizedCode === 'profile') {
        setActiveTab('profile');
      } else if (normalizedCode.startsWith('duel_')) {
        const challengeId = normalizedCode.replace('duel_', '');
        handleJoinSpecificDuel(challengeId);
      } else {
        code = sanitizeUserId(code);
        localStorage.setItem('rpsw_referred_by', code);
        setRefParam(code);
      }
    } else {
      code = localStorage.getItem('rpsw_referred_by') || '';
      const isStoredRoute = code.toLowerCase().trim() === 'arena' || code.toLowerCase().trim() === 'missions' || code.toLowerCase().trim() === 'leaderboard' || code.toLowerCase().trim() === 'profile' || code.toLowerCase().trim().startsWith('duel_');
      if (isStoredRoute) {
        localStorage.removeItem('rpsw_referred_by');
        code = '';
      }
      if (code) {
        setRefParam(code);
      }
    }

    // Fetch Global settings
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setGlobalSettings(data);
          setSettingsBotUsername(data.botUsername || '');
          setSettingsAppName(data.appName || '');
        }
      })
      .catch(err => console.error("Error fetching global settings:", err));
  }, [currentTgId]);

  // Sync / Register user with DB
  const syncProfile = async () => {
    if (!currentTgId) return;
    setSyncing(true);
    try {
      // Resolve referral code synchronously to eliminate state setters timing lag
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      let code = params.get('startapp') || params.get('tgWebAppStartParam') || params.get('ref') || (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param || '';
      const normalizedCode = code.toLowerCase().trim();
      const isRoute = normalizedCode === 'arena' || normalizedCode === 'missions' || normalizedCode === 'leaderboard' || normalizedCode === 'profile' || normalizedCode.startsWith('duel_');

      if (code && !isRoute) {
        code = sanitizeUserId(code);
        localStorage.setItem('rpsw_referred_by', code);
      } else {
        code = localStorage.getItem('rpsw_referred_by') || '';
        if (code) {
          const isStoredRoute = code.toLowerCase().trim() === 'arena' || code.toLowerCase().trim() === 'missions' || code.toLowerCase().trim() === 'leaderboard' || code.toLowerCase().trim() === 'profile' || code.toLowerCase().trim().startsWith('duel_');
          if (isStoredRoute) {
            code = '';
            localStorage.removeItem('rpsw_referred_by');
          } else {
            code = sanitizeUserId(code);
          }
        }
      }

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
          referredBy: code || null,
          lang: currentLanguage
        })
      });
      const data = await response.json();
      if (data.error) {
        setErrorMessage(data.error);
      } else {
        setProfile(data.profile);
        if (data.tonConfig) {
          setTonConfig(data.tonConfig);
        }
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

  // Mission claiming states and helpers
  const [claimingMission, setClaimingMission] = useState<Record<string, boolean>>({});
  const [triggeringMission, setTriggeringMission] = useState<Record<string, boolean>>({});
  const [hasClickedJoinChat, setHasClickedJoinChat] = useState<boolean>(() => localStorage.getItem('has_clicked_join_chat') === 'true');
  const [verifyingMembership, setVerifyingMembership] = useState<boolean>(false);

  const handleVerifyMembership = async () => {
    if (!currentTgId) return;
    setVerifyingMembership(true);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const res = await fetch('/api/missions/verify-community-membership', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: currentTgId })
      });
      const data = await res.json();
      if (data.error) {
        setErrorMessage(data.error);
      } else {
        playNotificationSound();
        confetti({
          particleCount: 50,
          spread: 40,
          origin: { y: 0.8 }
        });
        setProfile(prev => {
          if (!prev) return null;
          return {
            ...prev,
            missions: data.missions
          };
        });
        setStreakClaimSuccess("Membership verified successfully! Arena Cadet mission completed.");
        setTimeout(() => setStreakClaimSuccess(null), 4000);
      }
    } catch (e) {
      console.error("Error verifying membership:", e);
      setErrorMessage("Could not verify membership due to network error.");
    } finally {
      setVerifyingMembership(false);
    }
  };

  const handleClaimMission = async (missionId: string) => {
    if (!currentTgId) return;
    setClaimingMission(prev => ({ ...prev, [missionId]: true }));
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const res = await fetch('/api/mission/claim', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: currentTgId,
          missionId: missionId
        })
      });
      const data = await res.json();
      if (data.error) {
        setErrorMessage(data.error);
      } else {
        playRewardXPSound();
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 }
        });
        
        // Update profile in local state
        setProfile(prev => {
          if (!prev) return null;
          return {
            ...prev,
            vViral: data.vViral,
            missions: data.missions
          };
        });
        
        setStreakClaimSuccess(`Mission reward claimed! Received +${data.reward} vVIRAL.`);
        setTimeout(() => setStreakClaimSuccess(null), 4000);
      }
    } catch (e) {
      console.error("Error claiming mission:", e);
      setErrorMessage("Could not claim mission reward due to network error.");
    } finally {
      setClaimingMission(prev => ({ ...prev, [missionId]: false }));
    }
  };

  const handleTriggerMission = async (missionId: string) => {
    if (!currentTgId) return;
    setTriggeringMission(prev => ({ ...prev, [missionId]: true }));
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const res = await fetch('/api/mission/trigger', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: currentTgId,
          missionId: missionId
        })
      });
      const data = await res.json();
      if (data.error) {
        setErrorMessage(data.error);
      } else {
        playNotificationSound();
        if (data.profile) {
          setProfile(data.profile);
        }
      }
    } catch (e) {
      console.error("Error triggering mission:", e);
    } finally {
      setTriggeringMission(prev => ({ ...prev, [missionId]: false }));
    }
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

  // Automatic TON Deposit Recovery after app restart (Requirement 7)
  useEffect(() => {
    if (!currentTgId) return;
    
    const savedId = localStorage.getItem('pending_deposit_id');
    const savedAmount = localStorage.getItem('pending_deposit_amount');
    const savedAmountNano = localStorage.getItem('pending_deposit_amount_nano');
    const savedMessage = localStorage.getItem('pending_deposit_message');
    const savedTreasury = localStorage.getItem('pending_deposit_treasury');

    if (savedId && savedAmount) {
      console.log("[TON Recovery] Found unresolved pending deposit on startup:", savedId);
      setDepositPendingId(savedId);
      setDepositAmount(savedAmount);
      if (savedAmountNano) setDepositAmountNano(savedAmountNano);
      if (savedMessage) setDepositMessage(savedMessage);
      if (savedTreasury) setDepositTreasuryAddress(savedTreasury);
      setDepositPendingStatus('verifying');
      
      // Resume background polling check automatically
      startDepositPolling(savedId, savedAmount);
    }
  }, [currentTgId]);

  // Re-sync on TG login change, Wallet connection, or Language preference change
  useEffect(() => {
    syncProfile();
  }, [currentTgId, currentUsername, walletAddress, currentLanguage]);

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

        if (activeGame.status === 'searching') {
          // Poll matchmaking queue status using secure transaction status endpoint
          const res = await fetch('/api/matchmaking/status', { headers });
          const data = await res.json();
          if (data) {
            if (data.status === 'matched' && data.game) {
              setActiveGame(data.game);
              playMatchmakingPing(); // play start sound
            } else if (data.status === 'expired') {
              setErrorMessage("Matchmaking session expired. Please enter the queue again!");
              setActiveGame(null);
              setIsSearching(false);
              clearInterval(interval);
            } else if (data.status === 'cancelled') {
              setActiveGame(null);
              setIsSearching(false);
              clearInterval(interval);
            }
          }
        } else {
          // Poll active game session
          const res = await fetch(`/api/game/${activeGame.id}?requestorId=${currentTgId}`, { headers });
          const data = await res.json();
          if (data && data.game) {
            setActiveGame(data.game);
            if (data.game.status === 'completed') {
              syncProfile(); // refresh player profile immediately to see updated stats
              clearInterval(interval);
            }
          }
        }
      } catch (err) {
        console.error("Error polling game or matchmaking status:", err);
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

  // Helper to generate dynamic canonical referral links
  const getReferralUrl = () => {
    const bot = globalSettings.botUsername || '@CyberDuellitebot';
    const cleanBot = bot.replace('@', '').trim();
    return `https://t.me/${cleanBot}?startapp=${currentTgId}`;
  };

  // Copy Referral link
  const handleCopyReferral = () => {
    const referralLink = getReferralUrl();
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    playReferralSound();
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Save custom Telegram bot referral settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsSaveSuccess(null);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          requestorId: currentTgId,
          botUsername: settingsBotUsername,
          appName: settingsAppName
        })
      });
      const data = await res.json();
      if (data.success) {
        setGlobalSettings({
          botUsername: settingsBotUsername,
          appName: settingsAppName,
          webUrl: ""
        });
        setSettingsSaveSuccess("Settings saved! Future canonical referral links updated.");
        setTimeout(() => setSettingsSaveSuccess(null), 4000);
      } else {
        setSettingsSaveSuccess("Error saving settings: " + (data.error || "Unknown error"));
        setTimeout(() => setSettingsSaveSuccess(null), 6000);
      }
    } catch (e: any) {
      console.error(e);
      setSettingsSaveSuccess("Error: " + e.message);
      setTimeout(() => setSettingsSaveSuccess(null), 6000);
    } finally {
      setSavingSettings(false);
    }
  };

  // Submit Custom Tournament Broadcast Announcement to Group
  const handleSendAnnouncement = async () => {
    if (!announcementText.trim()) return;
    setAnnouncementLoading(true);
    setAnnouncementSuccess(null);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const res = await fetch('/api/admin/announcement', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          requestorId: currentTgId,
          text: announcementText
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnnouncementSuccess("Tournament announcement broadcasted successfully!");
        setAnnouncementText('');
        setTimeout(() => setAnnouncementSuccess(null), 4000);
      } else {
        setAnnouncementSuccess("Error: " + (data.error || "Broadcast failed."));
        setTimeout(() => setAnnouncementSuccess(null), 6000);
      }
    } catch (e: any) {
      console.error(e);
      setAnnouncementSuccess("Error: " + e.message);
      setTimeout(() => setAnnouncementSuccess(null), 6000);
    } finally {
      setAnnouncementLoading(false);
    }
  };

  // Construct and Pin Leaderboard message in community group
  const handlePublishLeaderboard = async () => {
    setPinningLoading(true);
    setPinningSuccess(null);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const res = await fetch('/api/admin/pinned-message', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          requestorId: currentTgId
        })
      });
      const data = await res.json();
      if (data.success) {
        setPinningSuccess("Community leaderboard pinned successfully!");
        setTimeout(() => setPinningSuccess(null), 4000);
      } else {
        setPinningSuccess("Error: " + (data.error || "Pinning failed."));
        setTimeout(() => setPinningSuccess(null), 6000);
      }
    } catch (e: any) {
      console.error(e);
      setPinningSuccess("Error: " + e.message);
      setTimeout(() => setPinningSuccess(null), 6000);
    } finally {
      setPinningLoading(false);
    }
  };

  // Cancel and Refund an active duel challenge
  const handleCancelActiveChallenge = async (gameId: string) => {
    setCancelLoading(true);
    setCancelSuccess(null);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        headers['x-telegram-init-data'] = initData;
      }

      const res = await fetch('/api/admin/cancel-challenge', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          requestorId: currentTgId,
          gameId: gameId
        })
      });
      const data = await res.json();
      if (data.success) {
        setCancelSuccess("Lobby challenge cancelled and refunded successfully!");
        // Refresh metrics list
        fetchAdminMetrics();
        setTimeout(() => setCancelSuccess(null), 4000);
      } else {
        setCancelSuccess("Error: " + (data.error || "Cancellation failed."));
        setTimeout(() => setCancelSuccess(null), 6000);
      }
    } catch (e: any) {
      console.error(e);
      setCancelSuccess("Error: " + e.message);
      setTimeout(() => setCancelSuccess(null), 6000);
    } finally {
      setCancelLoading(false);
    }
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
  const handleStartLobby = async (
    playWithBot: boolean = false, 
    mode: 'free' | 'stake' | 'ton' = selectedLobbyMode, 
    stake: number = selectedLobbyMode === 'stake' ? selectedLobbyStake : (selectedLobbyMode === 'ton' ? 1000000000 : 0)
  ) => {
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
          playWithBot: playWithBot,
          mode: mode,
          stake: stake
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

  if (!isInsideTMA && !isDevelopEnvironment) {
    return (
      <div className="min-h-screen bg-[#0e1621] text-white flex flex-col items-center justify-center font-sans selection:bg-[#3390ec] selection:text-white px-6 py-12 relative overflow-hidden">
        {/* Abstract futuristic background decorations */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#3390ec]/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />

        <div className="max-w-md w-full text-center space-y-8 relative z-10">
          <div className="flex flex-col items-center">
            {/* Elegant App Logo Badge */}
            <div className="w-20 h-20 bg-gradient-to-tr from-[#3390ec] to-[#2b7ad0] rounded-3xl flex items-center justify-center font-black text-4xl text-white shadow-2xl shadow-[#3390ec]/20 border border-[#3390ec]/30 mb-6 relative">
              R
              <span className="absolute -bottom-1.5 -right-1.5 bg-emerald-500 text-[10px] text-black font-black uppercase tracking-wider py-0.5 px-1.5 rounded-md border border-emerald-400">
                PvP
              </span>
            </div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tight">VIRAL ARENA</h1>
            <p className="text-[#708499] text-sm mt-2 font-medium">Rock Paper Scissors Well Duals</p>
          </div>

          <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl p-6 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Telegram-Only PvP Arena</h2>
            <p className="text-xs text-[#708499] leading-relaxed">
              This arena uses encrypted cryptographic signatures directly from the official Telegram app to prevent bots and verify secure duels. 
            </p>
            <p className="text-xs text-[#708499] leading-relaxed font-semibold text-emerald-400">
              To challenge real players, wager vVIRAL, and secure your wins, please launch this Mini App inside Telegram.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href="https://t.me/CyberDuellitebot"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#3390ec] hover:bg-[#2b7ad0] text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-[#3390ec]/15 hover:shadow-[#3390ec]/25 flex items-center justify-center gap-2 border border-[#3390ec]/45 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>🚀 Launch in Telegram Bot</span>
            </a>
            <div className="text-[10px] text-[#708499] font-medium uppercase tracking-widest flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span>@CyberDuellitebot</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e1621] text-white flex flex-col font-sans selection:bg-[#3390ec] selection:text-white max-w-full overflow-x-hidden">
      
      {/* Floating Global Success Notification */}
      <AnimatePresence>
        {floatingNotification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9, x: '-50%' }}
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, y: -50, scale: 0.9, x: '-50%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-sm bg-[#17212b] border-2 border-emerald-500/80 rounded-2xl p-4 shadow-[0_10px_30px_rgba(16,185,129,0.25)] flex items-start gap-3"
          >
            <span className="text-xl shrink-0">✅</span>
            <div className="flex-1">
              <p className="text-xs text-white leading-relaxed font-bold whitespace-pre-line">
                {floatingNotification}
              </p>
            </div>
            <button 
              onClick={() => setFloatingNotification(null)} 
              className="text-[#708499] hover:text-white font-bold text-xs shrink-0 cursor-pointer p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Sandbox Controller for Testing (Only shown in Normal Web Browser / Outside Telegram for authorized developers/reviewers) */}
      {!isInsideTMA && isDevelopEnvironment && (
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
          
          {/* Real TON Connection Button & Sound Toggle */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Global Sound Toggle */}
            <button
              id="btn_sound_toggle_header"
              onClick={toggleSoundMute}
              className="w-8 h-8 rounded-xl bg-[#242f3d]/60 hover:bg-[#2c394a] border border-[#2b3745] flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer"
              title={soundsMuted ? "Unmute Sounds" : "Mute Sounds"}
            >
              {soundsMuted ? (
                <VolumeX className="w-4.5 h-4.5 text-rose-400" />
              ) : (
                <Volume2 className="w-4.5 h-4.5 text-[#3390ec]" />
              )}
            </button>

            <div id="ton-button-parent" className="scale-[0.82] origin-right flex items-center">
              <div className="bg-[#242f3d]/60 rounded-full px-2 py-0.5 flex items-center border border-[#2b3745]">
                <TonConnectButton />
              </div>
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
                  <p className="text-[#708499] text-xs mt-1">{t('home.subtitle')}</p>
                </div>

                <div className="grid grid-cols-4 gap-2 w-full pt-2">
                  {[
                    { id: 'rock', emoji: '👊', label: t('play.rock') },
                    { id: 'scissors', emoji: '✂️', label: t('play.scissors') },
                    { id: 'paper', emoji: '📄', label: t('play.paper') },
                    { id: 'well', emoji: '🕳️', label: currentLanguage === 'zh-CN' ? '井' : currentLanguage === 'es' ? 'Pozo' : currentLanguage === 'ru' ? 'Колодец' : currentLanguage === 'de' ? 'Brunnen' : currentLanguage === 'fr' ? 'Puits' : currentLanguage === 'pt' ? 'Poço' : currentLanguage === 'ja' ? '井' : currentLanguage === 'hi' ? 'कुआँ' : currentLanguage === 'tr' ? 'Kuyu' : currentLanguage === 'id' ? 'Sumur' : currentLanguage === 'ar' ? 'البئر' : 'Well' }
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

              {/* Player Dashboard Card */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-5 space-y-4 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#3390ec]/5 rounded-full blur-xl pointer-events-none" />
                
                {/* Dashboard Header: User & Rank */}
                <div className="flex justify-between items-center pb-3 border-b border-[#242f3d]">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#3390ec]/10 border border-[#3390ec]/20 flex items-center justify-center text-lg shrink-0">
                      👤
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] text-[#708499] uppercase tracking-wider font-bold leading-none">{t('profile.title').split(' ')[0]}</p>
                      <h4 className="text-sm font-bold text-white truncate mt-1">@{currentUsername || currentTgId}</h4>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 leading-none ${currentRank.color} ${currentRank.bgColor} ${currentRank.borderColor}`}>
                      <span>{currentRank.badgeEmoji}</span>
                      <span>{getLocalizedRankName(currentRank.name, currentLanguage)}</span>
                    </span>
                  </div>
                </div>

                {/* Dashboard Balances: vVIRAL & TON */}
                <div className="grid grid-cols-2 gap-3">
                  {/* vVIRAL Balance */}
                  <div className="bg-[#0e1621]/80 rounded-2xl p-3 border border-[#242f3d]">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500 block leading-none">vVIRAL {t('home.balance')}</span>
                    <div className="flex items-baseline space-x-1 mt-2">
                      <span className="text-xl font-black text-white leading-none">
                        {profile?.vViral !== undefined ? profile.vViral : 500}
                      </span>
                      <span className="text-[9px] font-bold text-amber-500">vVIRAL</span>
                    </div>
                    <span className="text-[8px] text-[#708499] block mt-1.5 leading-tight">vVIRAL Game Credits</span>
                  </div>

                  {/* TON Wallet */}
                  <div className="bg-[#0e1621]/80 rounded-2xl p-3 border border-[#242f3d]">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#3390ec] block leading-none">TON {t('home.balance')}</span>
                    <div className="flex items-baseline space-x-1 mt-2">
                      <span className="text-xl font-black text-white leading-none">
                        {balanceLoading ? (
                          <RefreshCw className="animate-spin w-3 h-3 text-[#3390ec]" />
                        ) : walletAddress ? (
                          walletBalance
                        ) : (
                          "0.00"
                        )}
                      </span>
                      <span className="text-[9px] font-bold text-[#3390ec]">TON</span>
                    </div>
                    <span className="text-[8px] text-[#708499] block mt-1.5 leading-tight">
                      {walletAddress ? t('profile.tonAddress').split(' ')[0] : t('profile.disconnected')}
                    </span>
                  </div>
                </div>

                {/* TON Custodial Game Wallet Panel */}
                {ENABLE_TON_GAME_MODE && (
                  <div className="bg-[#17212b]/95 border border-[#3390ec]/30 rounded-3xl p-4.5 space-y-4 shadow-xl">
                    <div className="flex justify-between items-center pb-2 border-b border-[#242f3d]">
                      <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#3390ec] animate-pulse" />
                        TON Game Wallet (Custodial)
                      </span>
                      <span className="text-[9px] bg-[#3390ec]/15 text-[#3390ec] border border-[#3390ec]/25 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        {tonConfig?.network === 'testnet' ? 'Testnet' : 'Mainnet'}
                      </span>
                    </div>

                    {!walletAddress ? (
                      <div className="text-center py-3 space-y-2">
                        <p className="text-amber-500 text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5">
                          ⚠️ CONNECT WALLET TO USE TON GAMES
                        </p>
                        <p className="text-[#708499] text-[9.5px] leading-relaxed">
                          Please connect your TON wallet via the TON Connect button at the top of the screen to deposit, withdraw, or enter the 1 TON Duel Arena.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          {/* Connected Wallet Balance */}
                          <div className="bg-[#0e1621]/70 p-3 rounded-2xl border border-[#242f3d] flex flex-col justify-between">
                            <span className="text-[9px] text-[#708499] uppercase font-bold block leading-none">Wallet Balance</span>
                            <div className="flex items-baseline space-x-1 mt-1.5">
                              <span className="text-base font-black text-white leading-none">
                                {balanceLoading ? (
                                  <RefreshCw className="animate-spin w-3 h-3 text-[#3390ec]" />
                                ) : (
                                  walletBalance
                                )}
                              </span>
                              <span className="text-[9px] font-bold text-[#3390ec]">TON</span>
                            </div>
                            <span className="text-[7.5px] text-[#708499] block mt-1 leading-none">On-Chain Wallet</span>
                          </div>

                          {/* Internal Game TON Balance */}
                          <div className="bg-[#0e1621]/70 p-3 rounded-2xl border border-[#3390ec]/30 flex flex-col justify-between shadow-sm shadow-[#3390ec]/5">
                            <span className="text-[9px] text-[#3390ec] uppercase font-bold block leading-none">Game Balance</span>
                            <div className="flex items-baseline space-x-1 mt-1.5">
                              <span className="text-base font-black text-[#3390ec] leading-none">
                                {getTonValue(profile?.tonAccount?.availableNano)}
                              </span>
                              <span className="text-[9px] font-bold text-[#3390ec]">TON</span>
                            </div>
                            <span className="text-[7.5px] text-[#708499] block mt-1 leading-none">Internal Ledger</span>
                          </div>

                          {/* Reserved in TON Games */}
                          <div className="bg-[#0e1621]/70 p-3 rounded-2xl border border-[#242f3d] flex flex-col justify-between">
                            <span className="text-[9px] text-amber-500 uppercase font-bold block leading-none">Reserved</span>
                            <div className="flex items-baseline space-x-1 mt-1.5">
                              <span className="text-base font-black text-amber-400 leading-none">
                                {getTonValue(profile?.tonAccount?.reservedNano)}
                              </span>
                              <span className="text-[9px] font-bold text-amber-500">TON</span>
                            </div>
                            <span className="text-[7.5px] text-[#708499] block mt-1 leading-none">In Matchmaking Queue</span>
                          </div>

                          {/* Pending Withdrawal */}
                          <div className="bg-[#0e1621]/70 p-3 rounded-2xl border border-[#242f3d] flex flex-col justify-between">
                            <span className="text-[9px] text-purple-400 uppercase font-bold block leading-none">Pending Outbound</span>
                            <div className="flex items-baseline space-x-1 mt-1.5">
                              <span className="text-base font-black text-purple-400 leading-none">
                                {getTonValue(profile?.tonAccount?.pendingWithdrawalNano)}
                              </span>
                              <span className="text-[9px] font-bold text-purple-400">TON</span>
                            </div>
                            <span className="text-[7.5px] text-[#708499] block mt-1 leading-none">Outbound Queue</span>
                          </div>
                        </div>

                        {/* Buttons near the TON Game Wallet panel */}
                        <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-[#242f3d]">
                          <button
                            id="btn_ton_deposit"
                            onClick={() => { playClickSound(); setDepositVerifyError(null); setDepositPendingId(null); setDepositPendingStatus(''); setShowDepositModal(true); }}
                            className="bg-[#3390ec] hover:bg-[#2879c8] text-[#0e1621] py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider text-center transition cursor-pointer"
                          >
                            DEPOSIT
                          </button>
                          <button
                            id="btn_ton_withdraw"
                            onClick={() => { playClickSound(); setWithdrawError(null); setWithdrawSuccess(null); setShowWithdrawModal(true); }}
                            className="bg-[#242f3d] hover:bg-[#2d3b4c] text-white py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider text-center transition cursor-pointer"
                          >
                            WITHDRAW
                          </button>
                          <button
                            id="btn_ton_history"
                            onClick={() => { playClickSound(); handleFetchTonHistory(); }}
                            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider text-center transition cursor-pointer"
                          >
                            HISTORY
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Dashboard Stats Summary */}
                <div className="grid grid-cols-3 gap-2 bg-[#242f3d]/35 rounded-2xl p-2.5 text-center border border-[#242f3d]/40">
                  <div>
                    <span className="text-[9px] text-[#708499] uppercase block font-bold">{t('profile.played')}</span>
                    <span className="text-xs font-bold text-white mt-0.5 block">{profile?.gamesPlayed || 0}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-emerald-400 uppercase block font-bold">{t('profile.won')}</span>
                    <span className="text-xs font-bold text-emerald-400 mt-0.5 block">{profile?.wins || 0}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#3390ec] uppercase block font-bold">{t('profile.rate')}</span>
                    <span className="text-xs font-bold text-white mt-0.5 block">
                      {profile?.gamesPlayed && profile.gamesPlayed > 0 
                        ? `${Math.round(((profile.wins || 0) / profile.gamesPlayed) * 100)}%`
                        : "0%"
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Daily Login Streak & XP Progression Card */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🔥</span>
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">{t('home.streak')}</h4>
                      <p className="text-[#708499] text-[10px]">{currentLanguage === 'zh-CN' ? '领取您的每日经验奖励' : currentLanguage === 'es' ? 'Reclama tu bonificación de experiencia diaria' : currentLanguage === 'ru' ? 'Получите свой ежедневный бонус опыта' : currentLanguage === 'de' ? 'Fordere deinen täglichen Erfahrungsbonus an' : currentLanguage === 'fr' ? 'Réclamez votre bonus d\'expérience quotidien' : currentLanguage === 'pt' ? 'Resgate seu bônus diário de experiência' : currentLanguage === 'ja' ? '毎日の経験値ボーナスを獲得しよう' : currentLanguage === 'hi' ? 'अपने दैनिक अनुभव बोनस का दावा करें' : currentLanguage === 'tr' ? 'Günlük deneyim bonusunu talep et' : currentLanguage === 'id' ? 'Klaim bonus pengalaman harian Anda' : currentLanguage === 'ar' ? 'طالب بمكافأة الخبرة اليومية' : 'Claim your daily experience bonus'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-mono font-bold bg-[#3390ec]/10 text-[#3390ec] px-2.5 py-0.5 rounded-full border border-[#3390ec]/20 animate-pulse">
                      {profile?.streak ? t('home.streakDays', { days: profile.streak }) : t('home.streakDays', { days: 0 })}
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
                          {isCompleted ? (currentLanguage === 'zh-CN' ? '已领' : currentLanguage === 'es' ? 'Listo' : currentLanguage === 'ru' ? 'Ок' : currentLanguage === 'de' ? 'Erledigt' : currentLanguage === 'fr' ? 'Fait' : currentLanguage === 'pt' ? 'Feito' : currentLanguage === 'ja' ? '完了' : currentLanguage === 'hi' ? 'पूर्ण' : currentLanguage === 'tr' ? 'Bitti' : currentLanguage === 'id' ? 'Selesai' : currentLanguage === 'ar' ? 'تم' : 'Done') : `${dayXpBonus} XP`}
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
                        <span>✅</span> {t('home.rewardClaimed')}
                      </p>
                      <p className="text-[#708499] text-[10px]">
                        {currentLanguage === 'zh-CN' ? '在接下来的24小时内返回以保持连续登录！' : currentLanguage === 'es' ? '¡Regresa en las próximas 24 horas para mantener tu racha!' : currentLanguage === 'ru' ? 'Вернитесь в течение 24 часов, чтобы сохранить серию!' : currentLanguage === 'de' ? 'Kehre in den nächsten 24 Stunden zurück, um deine Serie aufrechtzuerhalten!' : currentLanguage === 'fr' ? 'Revenez dans les prochaines 24 heures pour conserver votre série !' : currentLanguage === 'pt' ? 'Volte nas próximas 24 horas para manter sua sequência!' : currentLanguage === 'ja' ? '連続記録を維持するために、次の24時間以内に戻ってきてください！' : currentLanguage === 'hi' ? 'अपनी स्ट्रीक बनाए रखने के लिए अगले 24 घंटों में वापस आएं!' : currentLanguage === 'tr' ? 'Serini devam ettirmek için önümüzdeki 24 saat içinde geri dön!' : currentLanguage === 'id' ? 'Kembali dalam 24 jam ke depan untuk menjaga beruntun Anda!' : currentLanguage === 'ar' ? 'عد خلال الـ 24 ساعة القادمة للحفاظ على سلسلة تسجيل الدخول!' : 'Return inside the next 24 hours to keep your streak burning!'}
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
                          <span>{t('home.claimReward').toUpperCase()}</span>
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
                            <span className="text-[10px] text-[#708499] uppercase tracking-wider font-bold block">{currentLanguage === 'zh-CN' ? '连续登录徽章' : currentLanguage === 'es' ? 'Insignia de racha activa' : currentLanguage === 'ru' ? 'Активный значок серии' : currentLanguage === 'de' ? 'Aktives Serien-Abzeichen' : currentLanguage === 'fr' ? 'Badge de série actif' : currentLanguage === 'pt' ? 'Emblema de sequência ativa' : currentLanguage === 'ja' ? 'アクティブな連続バッジ' : currentLanguage === 'hi' ? 'सक्रिय स्ट्रीक बैज' : currentLanguage === 'tr' ? 'Aktif Seri Rozeti' : currentLanguage === 'id' ? 'Lencana Beruntun Aktif' : currentLanguage === 'ar' ? 'شارة السلسلة النشطة' : 'Active Streak Badge'}</span>
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
                    ℹ️ {currentLanguage === 'zh-CN' ? '保持连续每日登录以解锁高级装饰徽章。' : currentLanguage === 'es' ? 'Mantén inicios de sesión diarios consecutivos para desbloquear insignias cosméticas premium.' : currentLanguage === 'ru' ? 'Заходите каждый день подряд, чтобы разблокировать косметические значки.' : currentLanguage === 'de' ? 'Melde dich täglich an, um kosmetische Abzeichen freizuschalten.' : currentLanguage === 'fr' ? 'Connectez-vous tous les jours de suite pour débloquer des badges cosmétiques premium.' : currentLanguage === 'pt' ? 'Mantenha logins diários consecutivos para desbloquear emblemas cosméticos premium.' : currentLanguage === 'ja' ? '毎日の連続ログインを維持して、プレミアム装飾バッジをアンロックしよう。' : currentLanguage === 'hi' ? 'प्रीमियम कॉस्मेटिक बैज अनलॉक करने के लिए लगातार दैनिक लॉगिन बनाए रखें।' : currentLanguage === 'tr' ? 'Premium kozmetik rozetlerin kilidini açmak için her gün giriş yap.' : currentLanguage === 'id' ? 'Pertahankan login harian berturut-turut untuk membuka lencana kosmetik premium.' : currentLanguage === 'ar' ? 'حافظ على تسجيل الدخول اليومي المتتالي لفتح الشارات التجميلية المميزة.' : 'Maintain consecutive daily logins to unlock premium cosmetic badges.'}
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
                      <span>🔰</span> {t('referrals.level', { num: Math.floor((profile?.xp || 0) / 1000) + 1 })} {t('profile.title').split(' ')[0]}
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
                  <span>{t('home.playNow').toUpperCase()}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                
                <button
                  onClick={() => setActiveTab('referrals')}
                  className="w-full h-12 bg-[#242f3d] hover:bg-[#2b3745] border border-[#2b3745] text-slate-200 font-semibold rounded-2xl transition flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4 text-[#3390ec]" />
                  <span>{t('referrals.title')}</span>
                </button>
              </div>

              {/* Rules Summary card */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl p-4 space-y-3">
                <span className="text-xs font-bold text-white block border-b border-[#242f3d] pb-1.5">{t('home.rules')}</span>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#708499] font-medium">
                  <div className="bg-[#242f3d] p-2 rounded-xl">
                    {getBeatsText('👊 ' + t('play.rock'), '✂️ ' + t('play.scissors'), currentLanguage)}
                  </div>
                  <div className="bg-[#242f3d] p-2 rounded-xl">
                    {getBeatsText('✂️ ' + t('play.scissors'), '📄 ' + t('play.paper'), currentLanguage)}
                  </div>
                  <div className="bg-[#242f3d] p-2 rounded-xl">
                    {getBeatsText('📄 ' + t('play.paper'), '👊 ' + t('play.rock'), currentLanguage)}
                  </div>
                  <div className="bg-[#242f3d] p-2 rounded-xl">
                    {getBeatsText('🕳️ ' + (currentLanguage === 'zh-CN' ? '井' : currentLanguage === 'es' ? 'Pozo' : currentLanguage === 'ru' ? 'Колодец' : currentLanguage === 'de' ? 'Brunnen' : currentLanguage === 'fr' ? 'Puits' : currentLanguage === 'pt' ? 'Poço' : currentLanguage === 'ja' ? '井' : currentLanguage === 'hi' ? 'कुआँ' : currentLanguage === 'tr' ? 'Kuyu' : currentLanguage === 'id' ? 'Sumur' : currentLanguage === 'ar' ? 'البئر' : 'Well'), '👊 ' + t('play.rock'), currentLanguage)}
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
                <div className="space-y-5 animate-fade-in">
                  <div className="text-center py-3">
                    <h3 className="text-lg font-extrabold text-white uppercase tracking-tight">Battle Arena Matchmaking</h3>
                    <p className="text-[#708499] text-xs mt-0.5">Choose your duel mode and stake</p>
                  </div>

                  {/* Mode & Stake Selector Card */}
                  <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-5 space-y-4 shadow-lg">
                    <div className="flex justify-between items-center pb-2.5 border-b border-[#242f3d]">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Duel Mode Selector</span>
                      <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/25 px-2.5 py-0.5 rounded-full font-mono font-bold">
                        Your Balance: {profile?.vViral !== undefined ? profile.vViral : 500} vVIRAL
                      </span>
                    </div>

                    {/* Mode Selector Buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => { playClickSound(); setSelectedLobbyMode('free'); }}
                        className={`py-3 px-1 rounded-2xl flex flex-col items-center justify-center border transition-all cursor-pointer ${
                          selectedLobbyMode === 'free'
                            ? 'bg-[#3390ec]/15 border-[#3390ec] text-white shadow-sm shadow-[#3390ec]/10'
                            : 'bg-[#0e1621]/60 border-[#242f3d] text-[#708499] hover:text-white'
                        }`}
                      >
                        <span className="text-base">🤝</span>
                        <span className="text-[10px] font-bold mt-1 uppercase tracking-wider text-center">Friendly</span>
                        <span className="text-[7.5px] opacity-75 mt-0.5 text-center leading-none">Free</span>
                      </button>

                      <button
                        onClick={() => { playClickSound(); setSelectedLobbyMode('stake'); }}
                        className={`py-3 px-1 rounded-2xl flex flex-col items-center justify-center border transition-all cursor-pointer ${
                          selectedLobbyMode === 'stake'
                            ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-sm shadow-amber-500/10'
                            : 'bg-[#0e1621]/60 border-[#242f3d] text-[#708499] hover:text-amber-400'
                        }`}
                      >
                        <span className="text-base">🪙</span>
                        <span className="text-[10px] font-bold mt-1 uppercase tracking-wider text-center">vVIRAL</span>
                        <span className="text-[7.5px] opacity-75 mt-0.5 text-center leading-none">Stake</span>
                      </button>

                      <button
                        onClick={() => { playClickSound(); setSelectedLobbyMode('ton'); }}
                        className={`py-3 px-1 rounded-2xl flex flex-col items-center justify-center border transition-all cursor-pointer ${
                          selectedLobbyMode === 'ton'
                            ? 'bg-[#3390ec]/20 border-[#3390ec] text-white shadow-sm shadow-[#3390ec]/15'
                            : 'bg-[#0e1621]/60 border-[#242f3d] text-[#708499] hover:text-cyan-400'
                        }`}
                      >
                        <span className="text-base">💎</span>
                        <span className="text-[10px] font-bold mt-1 uppercase tracking-wider text-center">1 TON Duel</span>
                        <span className="text-[7.5px] opacity-75 mt-0.5 text-center leading-none">Real TON</span>
                      </button>
                    </div>

                    {/* Stake amount selector if 'stake' mode is active */}
                    {selectedLobbyMode === 'stake' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-3 pt-2.5 border-t border-[#242f3d] overflow-hidden"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-[#708499] uppercase">Choose Stake Amount</span>
                          <span className="text-xs font-black text-amber-500 font-mono bg-amber-500/10 px-2 py-0.5 rounded">
                            {selectedLobbyStake} vVIRAL
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {[50, 100, 250, 500, 1000].map((stakeVal) => (
                            <button
                              key={stakeVal}
                              onClick={() => { playClickSound(); setSelectedLobbyStake(stakeVal); }}
                              className={`py-1.5 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                                selectedLobbyStake === stakeVal
                                  ? 'bg-amber-500 text-[#0e1621] border-amber-500 shadow-sm'
                                  : 'bg-[#0e1621] border-[#242f3d] text-[#708499] hover:text-white'
                              }`}
                            >
                              {stakeVal}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* TON details card if 'ton' mode is active */}
                    {selectedLobbyMode === 'ton' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-3 pt-2.5 border-t border-[#242f3d] overflow-hidden"
                      >
                        <div className="bg-[#0e1621]/80 rounded-2xl p-4 border border-[#242f3d] space-y-2.5 text-center">
                          <span className="text-xs font-bold text-white uppercase tracking-wider block">1 TON Duel Settings</span>
                          {tonConfig?.pauseGames ? (
                            <div className="bg-red-500/15 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-medium text-center">
                              ⚠️ 1 TON Duel mode is temporarily paused for system maintenance.
                            </div>
                          ) : (
                            <div className="space-y-3 text-left">
                              <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                                <div className="bg-[#17212b] p-2 rounded-xl border border-[#242f3d]">
                                  <span className="text-[8px] text-[#708499] uppercase block leading-none">Stake</span>
                                  <span className="font-bold text-white block mt-0.5">1 TON</span>
                                </div>
                                <div className="bg-[#17212b] p-2 rounded-xl border border-[#242f3d]">
                                  <span className="text-[8px] text-[#708499] uppercase block leading-none">Prize Pool</span>
                                  <span className="font-bold text-emerald-400 block mt-0.5">2 TON</span>
                                </div>
                                <div className="bg-[#17212b] p-2 rounded-xl border border-[#242f3d]">
                                  <span className="text-[8px] text-[#708499] uppercase block leading-none">Platform Fee</span>
                                  <span className="font-bold text-[#708499] block mt-0.5">5% (0.10 TON)</span>
                                </div>
                                <div className="bg-[#17212b] p-2 rounded-xl border border-[#242f3d]">
                                  <span className="text-[8px] text-amber-500 uppercase block leading-none">Winner Receives</span>
                                  <span className="font-black text-amber-400 block mt-0.5">1.90 TON</span>
                                </div>
                              </div>

                              {(!profile?.tonAccount || Number(profile.tonAccount.availableNano || 0) < 1000000000) && (
                                <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-xl text-[10px] text-amber-500 font-medium space-y-2">
                                  <span>⚠️ Insufficient Game TON Balance. You need at least 1 TON in your Game Balance to join.</span>
                                  <button
                                    onClick={() => { playClickSound(); setShowDepositModal(true); }}
                                    className="w-full bg-amber-500 hover:bg-amber-600 text-[#0e1621] py-1.5 px-3 rounded-lg text-[9px] font-black tracking-wider uppercase transition cursor-pointer"
                                  >
                                    DEPOSIT TON
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {/* Insufficient balance warning */}
                    {selectedLobbyMode === 'stake' && (profile?.vViral !== undefined ? profile.vViral : 500) < selectedLobbyStake && (
                      <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-2xl text-[10.5px] text-amber-500 font-medium">
                        ⚠️ Insufficient vVIRAL credits. Choose a lower stake amount, or claim daily login bonuses/missions to earn more.
                      </div>
                    )}
                  </div>

                  {/* Queue buttons with disabled check */}
                  {selectedLobbyMode === 'ton' ? (
                    <div className="grid grid-cols-1">
                      <button
                        disabled={
                          tonConfig?.pauseGames ||
                          !walletAddress ||
                          (profile?.tonAccount !== undefined && Number(profile.tonAccount.availableNano || 0) < 1000000000)
                        }
                        onClick={() => handleStartLobby(false, 'ton')}
                        className="group w-full py-4 bg-gradient-to-r from-[#3390ec] to-indigo-500 hover:from-[#2879c8] hover:to-indigo-600 disabled:from-[#1e2730] disabled:to-[#1e2730] disabled:opacity-40 disabled:cursor-not-allowed border border-[#2b3745] rounded-2xl text-center transition-all cursor-pointer font-black text-white text-sm uppercase tracking-wider shadow-md shadow-[#3390ec]/20"
                      >
                        {tonConfig?.pauseGames ? (
                          "1 TON DUEL PAUSED"
                        ) : !walletAddress ? (
                          "CONNECT WALLET TO PLAY"
                        ) : (profile?.tonAccount !== undefined && Number(profile.tonAccount.availableNano || 0) < 1000000000) ? (
                          "INSUFFICIENT TON BALANCE"
                        ) : (
                          "PLAY FOR 1 TON"
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3.5">
                      {/* Bot match */}
                      <button
                        disabled={selectedLobbyMode === 'stake' && (profile?.vViral !== undefined ? profile.vViral : 500) < selectedLobbyStake}
                        onClick={() => handleStartLobby(true)}
                        className="group bg-[#242f3d] hover:bg-[#3390ec] disabled:bg-[#1e2730] disabled:opacity-40 disabled:cursor-not-allowed border border-[#2b3745] p-5 rounded-2xl text-left transition-all flex items-center justify-between cursor-pointer"
                      >
                        <div className="space-y-1">
                          <span className="text-white group-hover:text-white font-bold text-sm flex items-center gap-1.5">
                            <Cpu className="w-4.5 h-4.5 text-[#3390ec] group-hover:text-white" />
                            Auto Bot Training Game
                          </span>
                          <p className="text-[#708499] group-hover:text-white/80 text-[11px]">Practice or play instantly against the AI Arena Bot.</p>
                        </div>
                        <ChevronRight className="w-4.5 h-4.5 text-[#708499] group-hover:text-white transition" />
                      </button>

                      {/* Online PvP match */}
                      <button
                        disabled={selectedLobbyMode === 'stake' && (profile?.vViral !== undefined ? profile.vViral : 500) < selectedLobbyStake}
                        onClick={() => handleStartLobby(false)}
                        className="group bg-[#17212b] hover:bg-[#3390ec] disabled:bg-[#121922] disabled:opacity-40 disabled:cursor-not-allowed border border-[#242f3d] p-5 rounded-2xl text-left transition-all flex items-center justify-between relative overflow-hidden cursor-pointer"
                      >
                        <div className="absolute right-0 top-0 w-24 h-24 bg-[#3390ec]/10 rounded-full blur-xl pointer-events-none" />
                        <div className="space-y-1 relative z-10">
                          <span className="text-[#3390ec] group-hover:text-white font-bold text-sm flex items-center gap-1.5">
                            <Gamepad2 className="w-4.5 h-4.5 text-[#3390ec] group-hover:text-white" />
                            Online PvP Duel Queue
                          </span>
                          <p className="text-[#708499] group-hover:text-white/80 text-[11px]">Atomically queues you up with another live player.</p>
                        </div>
                        <ChevronRight className="w-4.5 h-4.5 text-[#3390ec] group-hover:text-white transition animate-pulse" />
                      </button>
                    </div>
                  )}
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
                    
                    <AnimatePresence mode="wait">
                      {getArenaState() === 'searching' && (
                        <motion.div
                          key="searching"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.22 }}
                          className="space-y-6 py-4"
                        >
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
                          
                          <div className="pt-4 max-w-xs mx-auto space-y-3">
                            <button
                              onClick={handleCancelMatchmaking}
                              className="w-full bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                            >
                              Cancel Matchmaking
                            </button>
                            <button
                              onClick={() => {
                                handleCancelMatchmaking();
                                handleStartLobby(true);
                              }}
                              className="w-full bg-[#3390ec]/20 hover:bg-[#3390ec] text-[#3390ec] hover:text-white border border-[#3390ec]/30 py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Cpu className="w-4 h-4" />
                              Play with Bot instead 🤖
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {getArenaState() === 'countdown' && (() => {
                        const isP1 = activeGame?.player1Id === currentTgId;
                        const myUsername = isP1 ? (activeGame?.player1Username || currentUsername) : (activeGame?.player2Username || currentUsername);
                        const oppUsername = isP1 ? (activeGame?.player2Username || "Opponent") : (activeGame?.player1Username || "Opponent");

                        const myWins = isP1 ? (activeGame?.player1Profile?.wins ?? profile?.wins ?? 0) : (activeGame?.player2Profile?.wins ?? profile?.wins ?? 0);
                        const oppWins = isP1 ? (activeGame?.player2Profile?.wins ?? 12) : (activeGame?.player1Profile?.wins ?? 12);

                        const myRank = getPlayerRank(myWins);
                        const oppRank = getPlayerRank(oppWins);

                        const secondsLeft = getCountdownSecondsLeft();

                        return (
                          <motion.div
                            key="countdown"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.28 }}
                            className="space-y-6 py-4"
                          >
                            {/* Title Banner */}
                            <div className="relative">
                              <span className="bg-[#242f3d]/80 text-[#3390ec] text-[10px] uppercase font-black tracking-widest border border-[#3390ec]/30 px-4 py-1.5 rounded-full animate-pulse">
                                ⚔️ Battle Initiated ⚔️
                              </span>
                            </div>

                            {/* Opponent Reveal Grid */}
                            <div className="grid grid-cols-7 items-center gap-2 bg-[#242f3d]/20 p-5 rounded-3xl border border-[#242f3d]/50 relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-r from-[#3390ec]/5 via-transparent to-indigo-500/5 pointer-events-none" />

                              {/* Player Left: YOU */}
                              <div className="col-span-3 flex flex-col items-center space-y-2.5 text-center">
                                <div className="relative">
                                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#3390ec]/20 to-[#3390ec]/40 border-2 border-[#3390ec] flex items-center justify-center font-bold text-2xl text-[#3390ec] shadow-lg shadow-[#3390ec]/15 relative">
                                    {myUsername ? myUsername.charAt(0).toUpperCase() : 'Y'}
                                    <span className="absolute -bottom-1 -right-1 text-base">{myRank.badgeEmoji}</span>
                                  </div>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[10px] font-black text-[#708499] uppercase tracking-wider block">You</span>
                                  <span className="text-xs font-bold text-white block truncate max-w-[90px]">@{myUsername}</span>
                                  <span className={`text-[9px] font-bold ${myRank.color} block`}>{getLocalizedRankName(myRank.name, currentLanguage)}</span>
                                </div>
                              </div>

                              {/* Center: VS Emblem */}
                              <div className="col-span-1 flex flex-col items-center justify-center">
                                <div className="w-9 h-9 rounded-full bg-[#17212b] border border-[#242f3d] flex items-center justify-center font-black text-[11px] text-[#708499] shadow-inner relative z-10">
                                  VS
                                </div>
                              </div>

                              {/* Player Right: OPPONENT */}
                              <div className="col-span-3 flex flex-col items-center space-y-2.5 text-center">
                                <div className="relative">
                                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-indigo-500/40 border-2 border-indigo-500 flex items-center justify-center font-bold text-2xl text-indigo-400 shadow-lg shadow-indigo-500/15 relative animate-pulse">
                                    {oppUsername ? oppUsername.replace('@', '').charAt(0).toUpperCase() : 'O'}
                                    <span className="absolute -bottom-1 -right-1 text-base">{oppRank.badgeEmoji}</span>
                                  </div>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[10px] font-black text-[#708499] uppercase tracking-wider block">Opponent</span>
                                  <span className="text-xs font-bold text-indigo-300 block truncate max-w-[90px]">@{oppUsername}</span>
                                  <span className={`text-[9px] font-bold ${oppRank.color} block`}>{getLocalizedRankName(oppRank.name, currentLanguage)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Massive 3-2-1-FIGHT Countdown Screen */}
                            <div className="bg-[#17212b]/60 border border-[#242f3d]/60 rounded-2xl p-5 space-y-3 relative overflow-hidden">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#3390ec] animate-ping" />
                                <span className="text-[10px] text-[#708499] font-black uppercase tracking-widest">Pre-Round Countdown</span>
                              </div>

                              <div className="relative h-24 flex items-center justify-center">
                                <AnimatePresence mode="wait">
                                  <motion.div
                                    key={secondsLeft}
                                    initial={{ scale: 0.3, opacity: 0, rotate: -5 }}
                                    animate={{ scale: 1.15, opacity: 1, rotate: 0 }}
                                    exit={{ scale: 1.6, opacity: 0, rotate: 5 }}
                                    transition={{ duration: 0.38, ease: "easeOut" }}
                                    className="absolute font-sans font-black select-none tracking-tighter animate-bounce"
                                  >
                                    {secondsLeft > 0 ? (
                                      <span className="text-6xl text-[#3390ec] drop-shadow-[0_0_20px_rgba(51,144,236,0.4)]">
                                        {secondsLeft}
                                      </span>
                                    ) : (
                                      <span className="text-5xl text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 drop-shadow-[0_0_30px_rgba(245,158,11,0.5)] tracking-widest uppercase">
                                        FIGHT! ⚔️
                                      </span>
                                    )}
                                  </motion.div>
                                </AnimatePresence>
                              </div>

                              <p className="text-[#708499] text-[10px] leading-relaxed max-w-[280px] mx-auto">
                                Hold steady! Select your strategic move as soon as the battle begins.
                              </p>
                            </div>
                          </motion.div>
                        );
                      })()}

                      {getArenaState() === 'move_selection' && (
                        <motion.div
                          key="move_selection"
                          initial={{ opacity: 0, scale: 0.95, y: 15 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -15 }}
                          transition={{ duration: 0.22 }}
                          className="space-y-6"
                        >
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
                        </motion.div>
                      )}

                      {getArenaState() === 'resolving' && (
                        <motion.div
                          key="resolving"
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          transition={{ duration: 0.22 }}
                          className="space-y-6 py-6"
                        >
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
                        </motion.div>
                      )}

                      {getArenaState() === 'completed' && activeGame && (
                        <motion.div
                          key="completed"
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          variants={{
                            initial: { opacity: 0, scale: 0.93, y: 15 },
                            animate: { 
                              opacity: 1, 
                              scale: 1, 
                              y: 0,
                              transition: {
                                duration: 0.45,
                                ease: [0.16, 1, 0.3, 1],
                                when: "beforeChildren",
                                staggerChildren: 0.12
                              }
                            },
                            exit: { 
                              opacity: 0, 
                              scale: 0.95, 
                              y: -15,
                              transition: { duration: 0.2 }
                            }
                          }}
                          className="space-y-5"
                        >
                          <motion.div
                            variants={{
                              initial: { opacity: 0, y: 10 },
                              animate: { opacity: 1, y: 0, transition: { duration: 0.3 } }
                            }}
                          >
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
                              <motion.h3 
                                className="text-2xl font-bold text-emerald-400 mt-4"
                                animate={{ scale: [1, 1.08, 1], rotate: [0, 1, -1, 0] }}
                                transition={{ duration: 0.5, delay: 0.2, repeat: Infinity, repeatType: "reverse", repeatDelay: 3 }}
                              >
                                VICTORY! 🎉
                              </motion.h3>
                            ) : (
                              <h3 className="text-2xl font-bold text-red-400 mt-4">DEFEAT! 💀</h3>
                            )}
                          </motion.div>

                          <motion.div 
                            variants={{
                              initial: { opacity: 0, y: 15, scale: 0.96 },
                              animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: "easeOut" } }
                            }}
                            className="grid grid-cols-2 gap-4 bg-[#242f3d] p-6 rounded-2xl border border-[#2b3745] relative overflow-hidden"
                          >
                            {/* Backdrop highlight depending on status */}
                            <div className={`absolute inset-0 opacity-[0.03] pointer-events-none ${
                              activeGame.winnerId === 'draw' ? 'bg-amber-400' :
                              activeGame.winnerId === currentTgId ? 'bg-emerald-400' : 'bg-red-500'
                            }`} />

                            <div className="text-center space-y-1 z-10">
                              <span className="text-[10px] text-[#708499] block font-semibold">Your Move</span>
                              <motion.span 
                                className="text-5xl block py-2"
                                initial={{ scale: 0.5 }}
                                animate={{ scale: 1, transition: { type: "spring", stiffness: 200, damping: 12, delay: 0.25 } }}
                              >
                                {activeGame.player1Id === currentTgId ? (
                                  activeGame.player1Move === 'rock' ? '👊' : activeGame.player1Move === 'scissors' ? '✂️' : activeGame.player1Move === 'paper' ? '📄' : activeGame.player1Move === 'well' ? '🕳️' : '❓'
                                ) : (
                                  activeGame.player2Move === 'rock' ? '👊' : activeGame.player2Move === 'scissors' ? '✂️' : activeGame.player2Move === 'paper' ? '📄' : activeGame.player2Move === 'well' ? '🕳️' : '❓'
                                )}
                              </motion.span>
                              <span className="capitalize text-sm font-bold text-white">
                                {activeGame.player1Id === currentTgId ? (activeGame.player1Move || "No Move") : (activeGame.player2Move || "No Move")}
                              </span>
                            </div>

                            <div className="text-center space-y-1 border-l border-[#2b3745] z-10">
                              <span className="text-[10px] text-[#708499] block font-semibold">Opponent Move</span>
                              <motion.span 
                                className="text-5xl block py-2"
                                initial={{ scale: 0.5 }}
                                animate={{ scale: 1, transition: { type: "spring", stiffness: 200, damping: 12, delay: 0.35 } }}
                              >
                                {activeGame.player1Id === currentTgId ? (
                                  activeGame.player2Move === 'rock' ? '👊' : activeGame.player2Move === 'scissors' ? '✂️' : activeGame.player2Move === 'paper' ? '📄' : activeGame.player2Move === 'well' ? '🕳️' : '❓'
                                ) : (
                                  activeGame.player1Move === 'rock' ? '👊' : activeGame.player1Move === 'scissors' ? '✂️' : activeGame.player1Move === 'paper' ? '📄' : activeGame.player1Move === 'well' ? '🕳️' : '❓'
                                )}
                              </motion.span>
                              <span className="capitalize text-sm font-bold text-white">
                                {activeGame.player1Id === currentTgId ? (activeGame.player2Move || "No Move") : (activeGame.player1Move || "No Move")}
                              </span>
                            </div>
                          </motion.div>

                          <motion.div 
                            variants={{
                              initial: { opacity: 0, scale: 0.95, y: 10 },
                              animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }
                            }}
                            className="pt-2"
                          >
                            <button
                              onClick={resetGameLobby}
                              className="bg-[#3390ec] hover:bg-[#2b7ad0] text-white font-bold w-full py-4 px-4 rounded-2xl transition shadow-lg shadow-[#3390ec]/20 cursor-pointer"
                            >
                              PLAY AGAIN
                            </button>
                          </motion.div>
                        </motion.div>
                      )}

                      {getArenaState() === 'cancelled' && (
                        <motion.div
                          key="cancelled"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.22 }}
                          className="space-y-6 py-4"
                        >
                          <div className="relative inline-block text-red-500">
                            <ShieldAlert className="w-16 h-16 mx-auto animate-bounce" />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-lg font-bold text-white">Match Dissolved</h4>
                            <p className="text-[#708499] text-xs max-w-sm mx-auto">This battle was cancelled or dissolved because a player left the arena queue or failed to select their weapon.</p>
                          </div>
                          
                          <div className="pt-4 max-w-xs mx-auto space-y-3">
                            <button
                              onClick={resetGameLobby}
                              className="w-full bg-[#3390ec] hover:bg-[#2b7ad0] text-white py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                            >
                              Return to Lobby
                            </button>
                            <button
                              onClick={() => {
                                resetGameLobby();
                                handleStartLobby(false);
                              }}
                              className="w-full bg-[#242f3d]/60 hover:bg-[#242f3d]/90 text-[#3390ec] border border-[#2b3745] hover:border-[#3390ec]/30 py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Gamepad2 className="w-4 h-4" />
                              Search Another PvP Match
                            </button>
                            <button
                              onClick={() => {
                                resetGameLobby();
                                handleStartLobby(true);
                              }}
                              className="w-full bg-[#242f3d]/60 hover:bg-[#242f3d]/90 text-amber-400 border border-[#2b3745] hover:border-amber-400/30 py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Cpu className="w-4 h-4" />
                              Quick Play with Bot
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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

          {/* TAB 7: DAILY MISSIONS */}
          {activeTab === 'missions' && (
            <motion.div
              key="missions"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-6 select-none"
            >
              <div className="text-center py-4 relative flex flex-col items-center">
                <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-500/15 mb-3.5 border border-indigo-500/20">
                  <Award className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Daily Missions</h3>
                <p className="text-xs text-[#708499] mt-1 max-w-[280px]">
                  Power up your VIRAL Arena standing! Earn extra vVIRAL credits by completing daily challenges.
                </p>
              </div>

              {/* Mission Grid list */}
              <div className="space-y-3.5">
                {[
                  {
                    id: 'first_blood',
                    title: 'First Blood',
                    description: 'Engage in at least 1 match (PvP or Bot) in the Arena.',
                    target: 1,
                    reward: 100,
                    icon: '⚔️',
                    getCurrentProgress: () => profile?.gamesPlayed || 0
                  },
                  {
                    id: 'win_3_games',
                    title: 'Champion Duelist',
                    description: 'Claim victory in 3 matches in the Arena.',
                    target: 3,
                    reward: 300,
                    icon: '🏆',
                    getCurrentProgress: () => profile?.wins || 0
                  },
                  {
                    id: 'invite_friend',
                    title: 'Ecosystem Recruiter',
                    description: 'Invite 1 new combatant using your referral link.',
                    target: 1,
                    reward: 200,
                    icon: '👥',
                    getCurrentProgress: () => profile?.referralsCountL1 || 0
                  },
                  {
                    id: 'join_chat',
                    title: 'Arena Cadet',
                    description: 'Join the official VIRAL community channel.',
                    target: 1,
                    reward: 150,
                    icon: '📢',
                    getCurrentProgress: () => (profile?.missions?.['join_chat']?.completed ? 1 : 0),
                    action: () => {
                      if (hasClickedJoinChat) {
                        handleVerifyMembership();
                      } else {
                        // Open Link
                        if ((window as any).Telegram?.WebApp?.openTelegramLink) {
                          (window as any).Telegram.WebApp.openTelegramLink('https://t.me/VIRAL_App_Community');
                        } else {
                          window.open('https://t.me/VIRAL_App_Community', '_blank');
                        }
                        setHasClickedJoinChat(true);
                        localStorage.setItem('has_clicked_join_chat', 'true');
                      }
                    }
                  }
                ].map((m) => {
                  const mState = profile?.missions?.[m.id] || { progress: 0, completed: false, claimed: false };
                  const currentProg = m.getCurrentProgress();
                  const finalProg = Math.min(m.target, Math.max(mState.progress, currentProg));
                  const isCompleted = mState.completed || finalProg >= m.target;
                  const isClaimed = mState.claimed;

                  return (
                    <div 
                      key={m.id}
                      className={`bg-[#17212b] border rounded-2.5xl p-4.5 space-y-3 transition-all duration-300 relative overflow-hidden ${
                        isClaimed 
                          ? 'border-[#242f3d]/60 opacity-60' 
                          : isCompleted 
                            ? 'border-emerald-500/30 bg-emerald-500/[0.02]' 
                            : 'border-[#242f3d] hover:border-[#3390ec]/30'
                      }`}
                    >
                      {/* Top segment */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                            isClaimed ? 'bg-[#242f3d]' : isCompleted ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#242f3d]/80'
                          }`}>
                            {m.icon}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-white leading-tight truncate">{m.title}</h4>
                            <p className="text-[11px] text-[#708499] leading-snug mt-1">{m.description}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-amber-500 block leading-none">+{m.reward}</span>
                          <span className="text-[8px] text-[#708499] uppercase tracking-wider font-bold block mt-1">vVIRAL</span>
                        </div>
                      </div>

                      {/* Progress bar and claiming action */}
                      <div className="flex items-center justify-between gap-4 pt-1">
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-[#708499]">Progress</span>
                            <span className={isCompleted ? "text-emerald-400 font-bold" : "text-[#3390ec]"}>
                              {finalProg} / {m.target}
                            </span>
                          </div>
                          <div className="w-full bg-[#0e1621] rounded-full h-1.5 overflow-hidden border border-[#242f3d]">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${isCompleted ? 'bg-emerald-500' : 'bg-[#3390ec]'}`}
                              style={{ width: `${(finalProg / m.target) * 100}%` }}
                            />
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {isClaimed ? (
                            <span className="px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-500 bg-[#242f3d] border border-transparent block uppercase tracking-wider">
                              Claimed
                            </span>
                          ) : isCompleted ? (
                            <button
                              onClick={() => { playClickSound(); handleClaimMission(m.id); }}
                              disabled={claimingMission[m.id]}
                              className="px-4 py-1.5 rounded-xl text-[10px] font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition transform active:scale-95 shadow-md shadow-emerald-500/10 cursor-pointer block uppercase tracking-wider animate-pulse"
                            >
                              {claimingMission[m.id] ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Claim"}
                            </button>
                          ) : m.id === 'join_chat' ? (
                            <div className="flex flex-col items-center gap-1.5">
                              {hasClickedJoinChat ? (
                                <>
                                  <button
                                    onClick={() => { playClickSound(); m.action(); }}
                                    disabled={verifyingMembership}
                                    className="px-3 py-1.5 rounded-xl text-[10px] font-black text-white bg-[#3390ec] hover:bg-[#2883e0] transition transform active:scale-95 cursor-pointer block uppercase tracking-wider"
                                  >
                                    {verifyingMembership ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Verify Membership"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      playClickSound();
                                      if ((window as any).Telegram?.WebApp?.openTelegramLink) {
                                        (window as any).Telegram.WebApp.openTelegramLink('https://t.me/VIRAL_App_Community');
                                      } else {
                                        window.open('https://t.me/VIRAL_App_Community', '_blank');
                                      }
                                    }}
                                    className="text-[9px] text-[#3390ec] underline font-bold"
                                  >
                                    Re-join group
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => { playClickSound(); m.action(); }}
                                  className="px-4 py-1.5 rounded-xl text-[10px] font-black text-[#3390ec] bg-[#3390ec]/10 border border-[#3390ec]/25 hover:bg-[#3390ec]/20 transition transform active:scale-95 cursor-pointer block uppercase tracking-wider"
                                >
                                  Join Chat
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => { playClickSound(); setActiveTab('play'); }}
                              className="px-4 py-1.5 rounded-xl text-[10px] font-bold text-slate-400 bg-[#242f3d] border border-[#2b3745] hover:border-slate-500 transition transform active:scale-95 cursor-pointer block uppercase tracking-wider"
                            >
                              Go Play
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                    {getReferralUrl()}
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
                      <span>@{currentUsername || currentTgId}</span>
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
                  <span className="text-sm font-bold text-white uppercase tracking-wider">{t('profile.stats')}</span>
                  <Trophy className="w-4 h-4 text-amber-500" />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[#242f3d] p-2.5 rounded-xl border border-[#2b3745]">
                    <span className="text-[10px] text-[#708499] block font-semibold">{t('profile.played')}</span>
                    <span className="text-sm font-bold block text-white mt-0.5">{profile?.gamesPlayed || 0}</span>
                  </div>
                  <div className="bg-[#242f3d] p-2.5 rounded-xl border border-[#2b3745] border-b-emerald-500/30">
                    <span className="text-[10px] text-[#708499] block font-semibold">{t('profile.won')}</span>
                    <span className="text-sm font-bold block text-emerald-400 mt-0.5">{profile?.wins || 0}</span>
                  </div>
                  <div className="bg-[#242f3d] p-2.5 rounded-xl border border-[#2b3745] border-b-[#3390ec]/30">
                    <span className="text-[10px] text-[#708499] block font-semibold">{t('profile.rate')}</span>
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
                  <span className="text-sm font-bold text-white uppercase tracking-wider">{t('profile.settings')}</span>
                  <Volume2 className="w-4 h-4 text-[#3390ec]" />
                </div>
                <div className="flex items-center justify-between bg-[#242f3d] p-3.5 rounded-2xl border border-[#2b3745]">
                  <div className="flex items-center space-x-3 w-[72%]">
                    <div className="w-9 h-9 rounded-xl bg-[#17212b] flex items-center justify-center shrink-0">
                      {soundsMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-green-400" />}
                    </div>
                    <div>
                      <p className="font-bold text-xs text-white">{t('profile.sounds')}</p>
                      <p className="text-[9.5px] text-[#708499] leading-tight mt-0.5">{t('profile.soundsDesc')}</p>
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

                {/* Language Selector inside Settings (as required by prompt) */}
                <div className="bg-[#242f3d] p-3.5 rounded-2xl border border-[#2b3745] space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-[#17212b] flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-slate-300">A</span>
                    </div>
                    <div>
                      <p className="font-bold text-xs text-white">{t('profile.language')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(languageNames).map(([code, name]) => (
                      <button
                        key={code}
                        onClick={() => {
                          playClickSound();
                          setCurrentLanguage(code);
                          localStorage.setItem('rspw_lang', code);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                          currentLanguage === code
                            ? 'bg-[#3390ec] border-[#3390ec] text-white shadow-md'
                            : 'bg-[#17212b] border-[#2b3745] text-slate-300 hover:text-white hover:border-[#3390ec]/50'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
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

              {/* Profile Referral Program */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#242f3d] pb-3">
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Referral Program</span>
                  <Users className="w-4 h-4 text-[#3390ec]" />
                </div>
                <p className="text-xs text-[#708499] leading-relaxed">
                  Invite other duelists and earn commission rewards on multiple levels of active gameplay stakes!
                </p>

                {/* Level metrics summary */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-[#242f3d]/60 border border-[#2b3745] p-3 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="text-[#708499] text-[9px] font-bold uppercase">L1 Direct</p>
                      <p className="font-mono text-lg font-black text-white mt-1">{profile?.referralsCountL1 || 0}</p>
                    </div>
                    <span className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 font-bold px-2 py-0.5 rounded-full leading-none shrink-0">10%</span>
                  </div>
                  <div className="bg-[#242f3d]/60 border border-[#2b3745] p-3 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="text-[#708499] text-[9px] font-bold uppercase">L2 Indirect</p>
                      <p className="font-mono text-lg font-black text-white mt-1">{profile?.referralsCountL2 || 0}</p>
                    </div>
                    <span className="text-[10px] text-indigo-400 bg-indigo-400/10 border border-indigo-400/20 font-bold px-2 py-0.5 rounded-full leading-none shrink-0">5%</span>
                  </div>
                </div>

                {/* Copier link block */}
                <div className="p-3 bg-[#0e1621] rounded-2xl border border-[#242f3d] mt-2">
                  <p className="text-[#708499] text-[9px] uppercase font-bold mb-1.5">Your Referral Link</p>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 text-xs text-[#3390ec] truncate font-mono">
                      {getReferralUrl()}
                    </div>
                    <button
                      id="btn_profile_referral_qr"
                      onClick={() => { playClickSound(); setShowReferralQrModal(true); }}
                      className="bg-[#242f3d] border border-[#2b3745] hover:bg-[#2c394a] text-[#3390ec] p-2 rounded-xl transition transform active:scale-95 flex items-center justify-center cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
                    <button
                      id="btn_profile_copy_referral"
                      onClick={handleCopyReferral}
                      className="bg-white text-black p-2 rounded-xl hover:bg-slate-200 transition transform active:scale-95 flex items-center justify-center cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
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

              {/* Matchmaking Diagnostics */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#242f3d]/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Matchmaking Diagnostics</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#708499]">{adminData?.matchmakingStats?.cloudRunRevision || 'N/A'}</span>
                </div>

                <div className="grid grid-cols-2 gap-3.5 text-xs">
                  <div className="bg-[#242f3d]/30 p-3 rounded-xl border border-[#2b3745]/50">
                    <span className="text-[#708499] text-[10px] uppercase font-bold block">Waiting Players</span>
                    <span className="text-lg font-mono font-bold text-emerald-400 block mt-0.5">{adminData?.matchmakingStats?.usersWaiting ?? 0}</span>
                  </div>
                  <div className="bg-[#242f3d]/30 p-3 rounded-xl border border-[#2b3745]/50">
                    <span className="text-[#708499] text-[10px] uppercase font-bold block">Average Queue Age</span>
                    <span className="text-lg font-mono font-bold text-blue-400 block mt-0.5">{adminData?.matchmakingStats?.avgQueueAgeSec ?? 0}s</span>
                  </div>
                  <div className="bg-[#242f3d]/30 p-3 rounded-xl border border-[#2b3745]/50">
                    <span className="text-[#708499] text-[10px] uppercase font-bold block">Matched Pairs</span>
                    <span className="text-lg font-mono font-bold text-indigo-400 block mt-0.5">{adminData?.matchmakingStats?.matchedPairsCount ?? 0}</span>
                  </div>
                  <div className="bg-[#242f3d]/30 p-3 rounded-xl border border-[#2b3745]/50">
                    <span className="text-[#708499] text-[10px] uppercase font-bold block">Active PvP Matches</span>
                    <span className="text-lg font-mono font-bold text-amber-400 block mt-0.5">{adminData?.matchmakingStats?.activeMatchesCount ?? 0}</span>
                  </div>
                  <div className="bg-[#242f3d]/30 p-3 rounded-xl border border-[#2b3745]/50">
                    <span className="text-[#708499] text-[10px] uppercase font-bold block">Expired Queue Records</span>
                    <span className="text-lg font-mono font-bold text-red-400 block mt-0.5">{adminData?.matchmakingStats?.expiredCount ?? 0}</span>
                  </div>
                  <div className="bg-[#242f3d]/30 p-3 rounded-xl border border-[#2b3745]/50">
                    <span className="text-[#708499] text-[10px] uppercase font-bold block">Failed Transactions</span>
                    <span className="text-lg font-mono font-bold text-rose-500 block mt-0.5">{adminData?.matchmakingStats?.failedTransactionsCount ?? 0}</span>
                  </div>
                </div>

                {adminSuccessMessage && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center text-xs text-emerald-400 font-medium">
                    {adminSuccessMessage}
                  </div>
                )}

                <button
                  onClick={async () => {
                    try {
                      const headers: any = { 'Content-Type': 'application/json' };
                      const initData = (window as any).Telegram?.WebApp?.initData;
                      if (initData) {
                        headers['x-telegram-init-data'] = initData;
                      }
                      const res = await fetch(`/api/admin/matchmaking/cleanup?requestorId=${currentTgId}`, {
                        method: 'POST',
                        headers
                      });
                      const rData = await res.json();
                      if (rData.success) {
                        setAdminSuccessMessage(`Cleared ${rData.cleanedCount} stale queue entries.`);
                        setTimeout(() => setAdminSuccessMessage(null), 5000);
                        fetchAdminMetrics();
                      } else {
                        setAdminSuccessMessage(`Cleanup failed: ${rData.error}`);
                        setTimeout(() => setAdminSuccessMessage(null), 5000);
                      }
                    } catch (e: any) {
                      setAdminSuccessMessage(`Error: ${e.message}`);
                      setTimeout(() => setAdminSuccessMessage(null), 5000);
                    }
                  }}
                  className="w-full bg-[#242f3d] hover:bg-[#2b3745] text-xs font-bold text-white uppercase py-3 rounded-xl border border-[#2b3745] transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  🧹 Clear Stale Queue Entries
                </button>
              </div>

              {/* Bot Referral Link Customizer */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-[#242f3d]/60 pb-2.5">
                  <Bot className="w-4 h-4 text-[#3390ec]" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Telegram Referral Configuration</span>
                </div>

                <div className="grid grid-cols-2 gap-3.5 text-xs">
                  <div className="space-y-1">
                    <label className="text-[#708499] font-bold text-[10px] uppercase">Telegram Bot Name</label>
                    <input
                      type="text"
                      value={settingsBotUsername}
                      onChange={(e) => setSettingsBotUsername(e.target.value)}
                      placeholder="e.g. CyberDuellitebot"
                      className="w-full bg-[#242f3d] border border-[#2b3745] hover:border-[#3390ec]/50 focus:border-[#3390ec] rounded-xl px-3 py-2 text-white text-xs focus:outline-none transition font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[#708499] font-bold text-[10px] uppercase">Web App name (shortname)</label>
                    <input
                      type="text"
                      value={settingsAppName}
                      onChange={(e) => setSettingsAppName(e.target.value)}
                      placeholder="e.g. play"
                      className="w-full bg-[#242f3d] border border-[#2b3745] hover:border-[#3390ec]/50 focus:border-[#3390ec] rounded-xl px-3 py-2 text-white text-xs focus:outline-none transition font-medium"
                    />
                  </div>
                </div>

                {settingsSaveSuccess && (
                  <div className="text-emerald-400 text-xs font-semibold bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/25 text-center transition">
                    {settingsSaveSuccess}
                  </div>
                )}

                <div className="flex justify-between items-center bg-[#242f3d]/30 p-3 rounded-xl border border-[#2b3745]/30">
                  <span className="text-[9.5px] text-[#708499] leading-tight max-w-[65%]">
                    This dynamically updates all invite URLs to use the official short Telegram URL. Set blank to default to raw web URLs.
                  </span>
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition cursor-pointer select-none shadow-md ${savingSettings ? 'bg-[#3390ec]/50 cursor-not-allowed' : 'bg-[#3390ec] hover:bg-[#2b7ad0]'}`}
                  >
                    {savingSettings ? "Saving..." : "Save Config"}
                  </button>
                </div>
              </div>

              {/* Tournament Announcements & Pins (New Admin Features) */}
              <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-[#242f3d]/60 pb-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Tournament Announcements & Pinning</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[#708499] font-bold text-[10px] uppercase block">Broadcast Telegram Announcement</label>
                  <textarea
                    rows={3}
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    placeholder="Type official community tournament announcement to broadcast..."
                    className="w-full bg-[#242f3d] border border-[#2b3745] hover:border-[#3390ec]/50 focus:border-[#3390ec] rounded-xl px-3 py-2 text-white text-xs focus:outline-none transition font-medium"
                  />
                  {announcementSuccess && (
                    <div className="text-amber-400 text-[11px] font-semibold bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 text-center">
                      {announcementSuccess}
                    </div>
                  )}
                  <button
                    onClick={handleSendAnnouncement}
                    disabled={announcementLoading || !announcementText.trim()}
                    className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/40 text-black text-xs font-bold transition cursor-pointer"
                  >
                    {announcementLoading ? "Broadcasting..." : "Broadcast Announcement"}
                  </button>
                </div>

                <div className="pt-2 border-t border-[#242f3d]/50 space-y-1.5">
                  <label className="text-[#708499] font-bold text-[10px] uppercase block">Ecosystem Live Leaderboard Pinned Message</label>
                  {pinningSuccess && (
                    <div className="text-emerald-400 text-[11px] font-semibold bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 text-center">
                      {pinningSuccess}
                    </div>
                  )}
                  <button
                    onClick={handlePublishLeaderboard}
                    disabled={pinningLoading}
                    className="w-full py-2 rounded-xl bg-[#3390ec] hover:bg-[#2b7ad0] text-white text-xs font-bold transition cursor-pointer"
                  >
                    {pinningLoading ? "Publishing..." : "Publish & Pin Leaderboard to Community Group"}
                  </button>
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
                <span className="text-xs font-bold text-white block">Latest Lobbies & Challenges</span>
                {cancelSuccess && (
                  <div className="text-emerald-400 text-[11px] font-semibold bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 text-center transition">
                    {cancelSuccess}
                  </div>
                )}
                <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl overflow-hidden divide-y divide-[#242f3d]/60 max-h-48 overflow-y-auto">
                  {adminData?.games && adminData.games.length > 0 ? (
                    adminData.games.map((gm, i) => (
                      <div key={i} className="p-3 text-xs flex justify-between items-center bg-[#17212b]">
                        <div>
                          <span className="block text-slate-200">@{gm.player1Username} vs @{gm.player2Username}</span>
                          <span className="text-[10px] text-[#708499]">Moves: {gm.player1Move || '(none)'} vs {gm.player2Move || '(none)'}</span>
                          {gm.stake > 0 && <span className="text-[9px] text-amber-500 font-bold block">Stake: {gm.stake} vVIRAL</span>}
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          <span className="text-xs font-mono font-semibold uppercase block text-[#3390ec]">{gm.status}</span>
                          {(gm.status === 'waiting' || gm.status === 'matched') ? (
                            <button
                              onClick={() => { playClickSound(); handleCancelActiveChallenge(gm.id); }}
                              disabled={cancelLoading}
                              className="px-2 py-1 bg-red-500/15 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold rounded-lg transition transform active:scale-95 cursor-pointer"
                            >
                              {cancelLoading ? "Refunding..." : "Cancel & Refund"}
                            </button>
                          ) : (
                            <span className="text-[10px] text-amber-400 font-medium">Winner: {gm.winnerId === 'draw' ? 'Draw' : `@${gm.winnerId}`}</span>
                          )}
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
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === 'home' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Home className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-bold tracking-wider">{t('nav.home')}</span>
        </button>

        {/* NAV 2: PLAY */}
        <button
          onClick={() => { playClickSound(); setActiveTab('play'); }}
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === 'play' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Gamepad2 className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-bold tracking-wider">{t('nav.play')}</span>
        </button>

        {/* NAV 3: LEADERBOARD */}
        <button
          id="btn_nav_leaderboard"
          onClick={() => { playClickSound(); setActiveTab('leaderboard'); }}
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === 'leaderboard' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Trophy className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-bold tracking-wider">{t('nav.board')}</span>
        </button>


        {/* NAV 4: MISSIONS */}
        <button
          onClick={() => { playClickSound(); setActiveTab('missions'); }}
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === 'missions' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <Award className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-bold tracking-wider">{t('nav.missions')}</span>
        </button>

        {/* NAV 5: PROFILE */}
        <button
          onClick={() => { playClickSound(); setActiveTab('profile'); }}
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === 'profile' ? 'text-[#3390ec]' : 'text-[#708499] hover:text-white'}`}
        >
          <User className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-bold tracking-wider">{t('nav.profile')}</span>
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
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getReferralUrl())}`}
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
                <span className="truncate max-w-[150px]">{getReferralUrl()}</span>
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

        {/* TON DEPOSIT MODAL */}
        {showDepositModal && (
          <div id="modal_ton_deposit" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClickSound(); setShowDepositModal(false); }}
              className="absolute inset-0 bg-black/80 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#17212b] border border-[#3390ec]/30 rounded-3xl p-6 w-full max-w-sm relative z-10 shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b border-[#242f3d]">
                <span className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowDownLeft className="w-5 h-5 text-[#3390ec]" />
                  Deposit TON
                </span>
                <button
                  id="btn_close_deposit_modal"
                  onClick={() => { playClickSound(); setShowDepositModal(false); }}
                  className="p-1 rounded-sm hover:bg-[#242f3d] text-[#708499] hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {tonConfig?.pauseDeposits ? (
                <div className="bg-red-500/15 border border-red-500/30 text-red-400 p-4 rounded-2xl text-xs font-medium text-center space-y-2">
                  <p className="font-bold uppercase tracking-wider">Deposits Suspended</p>
                  <p className="text-[11px] opacity-80 leading-relaxed">TON deposits are temporarily paused for system upgrading. Please try again later.</p>
                </div>
              ) : depositPendingStatus === 'completed' ? (
                <div className="text-center py-4 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-2xl font-black">
                    ✓
                  </div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wide">Deposit Successful!</h4>
                  <p className="text-xs text-[#708499] leading-relaxed">
                    We have successfully credited <span className="text-emerald-400 font-bold">{depositAmount} TON</span> to your internal Game TON Balance! Enjoy the Arena!
                  </p>
                  <button
                    onClick={() => { playClickSound(); setShowDepositModal(false); }}
                    className="w-full py-2.5 bg-[#3390ec] text-[#0e1621] font-black rounded-xl text-xs transition cursor-pointer"
                  >
                    BACK TO ARENA
                  </button>
                </div>
              ) : !depositPendingId ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#708499] font-bold uppercase tracking-wider block">Select Preset Amount (TON)</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['1', '2', '5', '10'].map((preset) => (
                        <button
                          key={preset}
                          onClick={() => { playClickSound(); setDepositAmount(preset); }}
                          className={`py-2 text-xs font-mono font-bold rounded-xl border transition-all cursor-pointer ${
                            depositAmount === preset
                              ? 'bg-[#3390ec] text-[#0e1621] border-[#3390ec] font-black shadow-md shadow-[#3390ec]/15'
                              : 'bg-[#0e1621] border-[#242f3d] text-[#708499] hover:text-white'
                          }`}
                        >
                          {preset} TON
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#708499] font-bold uppercase tracking-wider block">Or Custom Amount (TON)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full bg-[#0e1621] border border-[#242f3d] rounded-xl py-2.5 px-3 text-xs font-bold font-mono text-white focus:outline-none focus:border-[#3390ec] text-center"
                      placeholder="0.00"
                    />
                  </div>

                  {depositVerifyError && (
                    <div className="bg-red-500/10 border border-red-500/25 p-2.5 rounded-xl text-[10.5px] text-red-400 leading-normal">
                      ⚠️ {depositVerifyError}
                    </div>
                  )}

                  <button
                    disabled={depositLoading || !depositAmount || parseFloat(depositAmount) <= 0}
                    onClick={handleCreateDepositIntent}
                    className="w-full py-3 bg-[#3390ec] hover:bg-[#2879c8] disabled:bg-[#1e2730] disabled:opacity-40 disabled:cursor-not-allowed text-[#0e1621] font-black rounded-xl text-xs tracking-wider uppercase transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {depositLoading ? (
                      <>
                        <RefreshCw className="animate-spin w-3.5 h-3.5" />
                        CREATING INTENT...
                      </>
                    ) : (
                      "INITIALIZE DEPOSIT"
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="bg-[#0e1621] p-3.5 rounded-2xl border border-[#242f3d] space-y-2.5 font-mono">
                    <div className="flex justify-between items-center text-[10px] border-b border-[#242f3d] pb-1.5">
                      <span className="text-[#708499] uppercase font-bold">Deposit Intent ID</span>
                      <span className="text-white font-bold">{depositPendingId.slice(0, 8)}...</span>
                    </div>

                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] text-[#708499] uppercase font-bold">Amount to Pay:</span>
                      <span className="text-base font-black text-emerald-400">{depositAmount} TON</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-[#708499] uppercase font-bold">Treasury Wallet:</span>
                        <button
                          onClick={() => { playClickSound(); navigator.clipboard.writeText(depositTreasuryAddress); }}
                          className="text-[9px] text-[#3390ec] hover:underline cursor-pointer flex items-center gap-0.5"
                        >
                          <Copy className="w-2.5 h-2.5" /> COPY
                        </button>
                      </div>
                      <p className="text-[9.5px] text-white break-all leading-normal bg-[#17212b] p-1.5 rounded border border-[#242f3d]/60 select-all">
                        {depositTreasuryAddress}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-amber-500 uppercase font-bold">Required Comment:</span>
                        <button
                          onClick={() => { playClickSound(); navigator.clipboard.writeText(depositMessage); }}
                          className="text-[9px] text-[#3390ec] hover:underline cursor-pointer flex items-center gap-0.5"
                        >
                          <Copy className="w-2.5 h-2.5" /> COPY
                        </button>
                      </div>
                      <p className="text-[11px] font-black text-amber-400 bg-amber-500/10 p-2 rounded border border-amber-500/20 text-center select-all">
                        {depositMessage}
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-xl text-[9.5px] text-amber-500 leading-normal space-y-1">
                    <p className="font-bold uppercase">⚠️ CRITICAL DIRECTIVE:</p>
                    <p>You MUST include the exact unique comment above in your transaction, or your deposit will not be credited.</p>
                  </div>

                  {depositPolling && (
                    <div className="bg-[#3390ec]/15 border border-[#3390ec]/30 p-3 rounded-2xl flex items-center justify-center gap-2 text-xs text-[#3390ec] font-bold">
                      <RefreshCw className="animate-spin w-4 h-4 text-[#3390ec]" />
                      <span>Automatically detecting on-chain transaction...</span>
                    </div>
                  )}

                  {depositVerifyError && (
                    <div className="bg-red-500/10 border border-red-500/25 p-2.5 rounded-xl text-[10.5px] text-red-400 leading-normal whitespace-pre-line">
                      ⚠️ {depositVerifyError}
                    </div>
                  )}

                  <div className="space-y-2 pt-1.5 border-t border-[#242f3d]">
                    <button
                      disabled={depositLoading || depositPolling}
                      onClick={async () => {
                        playClickSound();
                        setDepositVerifyError(null);
                        const targetChainId = tonConfig?.network === 'mainnet' ? "-239" : "-3";
                        if (!wallet || wallet.account.chain !== targetChainId) {
                          if (tonConfig?.network === 'mainnet') {
                            setDepositVerifyError("Please switch your wallet to TON Mainnet.");
                          } else {
                            setDepositVerifyError("Please switch your wallet to TON Testnet.");
                          }
                          return;
                        }
                        setDepositLoading(true);
                        try {
                          const txParams = {
                            validUntil: Math.floor(Date.now() / 1000) + 300,
                            messages: [
                              {
                                address: depositTreasuryAddress,
                                amount: String(depositAmountNano),
                                payload: buildTextCommentBoc(depositMessage)
                              }
                            ]
                          };
                          console.log("TON Connect sendTransaction parameters:", JSON.stringify(txParams, null, 2));
                          await tonConnectUI.sendTransaction(txParams);
                          
                          // After transaction is signed, we automatically start polling the backend
                          if (depositPendingId) {
                            startDepositPolling(depositPendingId, depositAmount);
                          }
                        } catch (err: any) {
                          console.error(err);
                          setDepositVerifyError("Transaction aborted or failed: " + err.message);
                        } finally {
                          setDepositLoading(false);
                        }
                      }}
                      className="w-full py-3 bg-[#3390ec] hover:bg-[#2879c8] disabled:opacity-40 disabled:cursor-not-allowed text-[#0e1621] font-black rounded-xl text-xs tracking-wider uppercase transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {depositPolling ? "POLLING TRANSACTION..." : "PAY VIA TON CONNECT"}
                    </button>

                    {isDevelopEnvironment && (
                      <button
                        onClick={() => handleVerifyDeposit(true)}
                        className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-[9px] tracking-widest uppercase transition cursor-pointer"
                      >
                        ⚡ SIMULATE SUCCESS (DEV SANDBOX)
                      </button>
                    )}

                    <button
                      onClick={() => { 
                        playClickSound(); 
                        if (depositIntervalRef.current) {
                          clearInterval(depositIntervalRef.current);
                          depositIntervalRef.current = null;
                        }
                        setDepositPolling(false);
                        setDepositPendingId(null); 
                      }}
                      className="w-full py-1.5 text-[#708499] hover:text-white transition text-[10px] uppercase font-bold text-center cursor-pointer"
                    >
                      START OVER / CHOOSE DIFFERENT AMOUNT
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* TON WITHDRAWAL MODAL */}
        {showWithdrawModal && (
          <div id="modal_ton_withdraw" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClickSound(); setShowWithdrawModal(false); }}
              className="absolute inset-0 bg-black/80 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#17212b] border border-[#2b3745] rounded-3xl p-6 w-full max-w-sm relative z-10 shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b border-[#242f3d]">
                <span className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowUpRight className="w-5 h-5 text-purple-400" />
                  Withdraw TON
                </span>
                <button
                  id="btn_close_withdraw_modal"
                  onClick={() => { playClickSound(); setShowWithdrawModal(false); }}
                  className="p-1 rounded-sm hover:bg-[#242f3d] text-[#708499] hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {tonConfig?.pauseWithdrawals ? (
                <div className="bg-red-500/15 border border-red-500/30 text-red-400 p-4 rounded-2xl text-xs font-medium text-center space-y-2">
                  <p className="font-bold uppercase tracking-wider">Withdrawals Suspended</p>
                  <p className="text-[11px] opacity-80 leading-relaxed">Outbound TON withdrawals are temporarily paused for backend ledger balancing. Please try again later.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-[#0e1621] p-3 rounded-2xl border border-[#242f3d] flex justify-between items-center text-xs">
                    <span className="text-[#708499] uppercase font-bold text-[9.5px]">Available Game Balance:</span>
                    <span className="font-black text-white text-sm">
                      {getTonValue(profile?.tonAccount?.availableNano)} TON
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#708499] font-bold uppercase tracking-wider block">Withdrawal Amount (TON)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="1.0"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-[#0e1621] border border-[#242f3d] rounded-xl py-2.5 px-3 text-xs font-bold font-mono text-white focus:outline-none focus:border-[#3390ec] text-center"
                      placeholder="Min 1.0 TON"
                    />
                    <span className="text-[8.5px] text-[#708499] block mt-1 leading-none">Min limit: 1 TON. Max limit: 100 TON per transaction.</span>
                  </div>

                  <div className="space-y-1.5 font-mono text-[9.5px] text-[#708499] bg-[#0e1621] p-3 rounded-xl border border-[#242f3d] leading-normal">
                    <span className="text-[8px] text-[#708499] uppercase font-bold block mb-1">Outbound Connected Destination Address:</span>
                    <span className="text-white break-all">{walletAddress}</span>
                  </div>

                  {withdrawError && (
                    <div className="bg-red-500/10 border border-red-500/25 p-2.5 rounded-xl text-[10.5px] text-red-400 leading-normal">
                      ⚠️ {withdrawError}
                    </div>
                  )}

                  {withdrawSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/25 p-2.5 rounded-xl text-[10.5px] text-emerald-400 leading-normal">
                      ✓ {withdrawSuccess}
                    </div>
                  )}

                  <button
                    disabled={withdrawLoading || !withdrawAmount || parseFloat(withdrawAmount) < 1}
                    onClick={handleRequestWithdrawal}
                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-[#1e2730] disabled:to-[#1e2730] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs tracking-wider uppercase transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {withdrawLoading ? (
                      <>
                        <RefreshCw className="animate-spin w-3.5 h-3.5" />
                        SUBMITTING REQUEST...
                      </>
                    ) : (
                      "REQUEST OUTBOUND WITHDRAWAL"
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* TON LEDGER HISTORY MODAL */}
        {showTonHistoryModal && (
          <div id="modal_ton_history" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playClickSound(); setShowTonHistoryModal(false); }}
              className="absolute inset-0 bg-black/80 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#17212b] border border-[#2b3745] rounded-3xl p-6 w-full max-w-sm relative z-10 shadow-2xl space-y-4 flex flex-col max-h-[85vh]"
            >
              <div className="flex justify-between items-center pb-2 border-b border-[#242f3d] shrink-0">
                <span className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-5 h-5 text-amber-500" />
                  TON Game Ledger History
                </span>
                <button
                  id="btn_close_history_modal"
                  onClick={() => { playClickSound(); setShowTonHistoryModal(false); }}
                  className="p-1 rounded-sm hover:bg-[#242f3d] text-[#708499] hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto grow space-y-2.5 pr-1 py-1 scrollbar-thin">
                {tonHistoryLoading ? (
                  <div className="text-center py-12 space-y-3 shrink-0">
                    <RefreshCw className="animate-spin w-8 h-8 text-[#3390ec] mx-auto" />
                    <p className="text-xs text-[#708499]">Retrieving unified transaction logs...</p>
                  </div>
                ) : tonHistory.length === 0 ? (
                  <div className="text-center py-12 space-y-1.5 shrink-0">
                    <p className="text-xs font-bold text-white uppercase">No Transactions Yet</p>
                    <p className="text-[10px] text-[#708499] max-w-xs mx-auto">
                      All your on-chain deposits, outbound withdrawals, stakes, wins, losses, draws, and refunds will appear here.
                    </p>
                  </div>
                ) : (
                  tonHistory.map((item: any, idx: number) => {
                    const isCredit = item.type === 'deposit' || item.type === 'game_win' || item.type === 'refund' || item.type === 'draw';
                    const isDebit = item.type === 'withdrawal' || item.type === 'game_loss' || item.type === 'stake_reservation';
                    
                    return (
                      <div
                        key={item.id || idx}
                        className="bg-[#0e1621]/60 border border-[#242f3d] rounded-2xl p-3 flex items-center justify-between text-xs transition hover:border-[#2b3745]"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shrink-0 ${
                            item.type === 'deposit' ? 'bg-[#3390ec]/15 text-[#3390ec]' :
                            item.type === 'withdrawal' ? 'bg-purple-500/15 text-purple-400' :
                            item.type === 'game_win' ? 'bg-emerald-500/15 text-emerald-400' :
                            item.type === 'game_loss' ? 'bg-red-500/15 text-red-400' :
                            'bg-amber-500/15 text-amber-500'
                          }`}>
                            {item.type === 'deposit' ? <ArrowDownLeft className="w-4 h-4" /> :
                             item.type === 'withdrawal' ? <ArrowUpRight className="w-4 h-4" /> :
                             item.type === 'game_win' ? <Trophy className="w-4 h-4 text-emerald-400" /> :
                             item.type === 'game_loss' ? <X className="w-4 h-4 text-red-400" /> :
                             item.type === 'stake_reservation' ? <Lock className="w-4 h-4" /> :
                             <RefreshCw className="w-3.5 h-3.5" />}
                          </div>

                          <div className="space-y-0.5 min-w-0">
                            <span className="font-bold text-white text-[11px] block truncate">
                              {item.type === 'deposit' ? 'On-chain Deposit' :
                               item.type === 'withdrawal' ? 'Outbound Withdrawal' :
                               item.type === 'game_win' ? 'Arena Match Win' :
                               item.type === 'game_loss' ? 'Arena Match Loss' :
                               item.type === 'stake_reservation' ? 'Staking Lock' :
                               item.type === 'refund' ? 'Staking Refund' :
                               item.type === 'draw' ? 'Match Draw' : item.type}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8.5px] text-[#708499] block font-mono">
                                {item.createdAt ? new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'Recent'}
                              </span>
                              <span className={`text-[7.5px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full ${
                                item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                item.status === 'pending' ? 'bg-amber-500/10 text-amber-400 animate-pulse' :
                                'bg-red-500/10 text-red-400'
                              }`}>
                                {item.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`font-black font-mono text-[11.5px] block ${
                            isCredit ? 'text-emerald-400' : isDebit ? 'text-rose-400' : 'text-slate-400'
                          }`}>
                            {isCredit ? '+' : isDebit ? '-' : ''}
                            {getTonValue(item.amountNano)}
                          </span>
                          <span className="text-[8px] text-[#708499] uppercase font-bold font-mono">TON</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <button
                id="btn_close_history"
                onClick={() => { playClickSound(); setShowTonHistoryModal(false); }}
                className="w-full py-2.5 bg-[#242f3d] text-white font-bold rounded-xl text-xs transition cursor-pointer shrink-0 border border-[#2b3745] active:scale-[0.98]"
              >
                CLOSE LEDGER
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
