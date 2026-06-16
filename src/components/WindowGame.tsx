import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Laptop, 
  Layers, 
  ExternalLink, 
  Plus, 
  Trash2, 
  Activity, 
  Sparkles, 
  Info, 
  RotateCcw,
  Volume2,
  VolumeX,
  Trophy,
  Dribbble,
  Maximize2
} from 'lucide-react';

interface WindowMeta {
  id: string;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  updatedAt: number;
}

type WeaponType = 'rock' | 'scissors' | 'paper' | 'well';

interface SharedBall {
  id: string;
  type: WeaponType;
  screenX: number;
  screenY: number;
  vx: number;
  vy: number;
  radius: number;
  ownerId: string;
}

interface WindowGameProps {
  currentTgId: string;
  currentUsername: string;
  userWins: number;
  onRewardWins: (amount: number) => void;
  playClickSound: () => void;
  soundsMuted: boolean;
}

const WEAPON_EMOJIS: Record<WeaponType, string> = {
  rock: '👊',
  scissors: '✂️',
  paper: '📄',
  well: '🕳️'
};

const WEAPON_COLORS: Record<WeaponType, string> = {
  rock: '#f59e0b',     // Amber
  scissors: '#ec4899', // Pink
  paper: '#3b82f6',    // Blue
  well: '#bfdbfe'      // Indigo/Light blue
};

export default function WindowGame({
  currentTgId,
  currentUsername,
  userWins,
  onRewardWins,
  playClickSound,
  soundsMuted
}: WindowGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Core Identifier for this window
  const [windowId] = useState(() => 'win_' + Math.random().toString(36).substr(2, 9));
  const [isPopup, setIsPopup] = useState(false);

  // Connected Windows & State
  const [activeWindows, setActiveWindows] = useState<WindowMeta[]>([]);
  const [balls, setBalls] = useState<SharedBall[]>([]);
  const [collisionStats, setCollisionStats] = useState({
    conversions: 0,
    wellAbsorbs: 0,
    totalBounces: 0
  });

  // Settings
  const [gravityEnabled, setGravityEnabled] = useState(true);
  const [portalOpen, setPortalOpen] = useState(true);
  const [statsRewarded, setStatsRewarded] = useState(false);

  // Local React Refs for high frequency loop (avoids stale state in intervals/RAF)
  const windowIdRef = useRef(windowId);
  const ballsRef = useRef<SharedBall[]>([]);
  const activeWindowsRef = useRef<WindowMeta[]>([]);
  const statisticsRef = useRef({ conversions: 0, wellAbsorbs: 0, totalBounces: 0 });

  // Channel to synchronize real-time state with zero lag
  useEffect(() => {
    // Detect if this is opened in popup mode
    const params = new URLSearchParams(window.location.search);
    if (params.get('popup') === 'true' || params.get('tab') === 'windows') {
      setIsPopup(true);
    }
  }, []);

  // Sync state refs
  useEffect(() => {
    ballsRef.current = balls;
  }, [balls]);

  useEffect(() => {
    activeWindowsRef.current = activeWindows;
  }, [activeWindows]);

  // Play micro collision sounds locally (only if not muted)
  const playCollisionSound = () => {
    if (soundsMuted) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // Audio context block browser permission fallback
    }
  };

  // 1. WINDOW TO WINDOW REGISTRATION
  useEffect(() => {
    // Heartbeat function to announce ourselves in localStorage
    const announceWindow = () => {
      const meta: WindowMeta = {
        id: windowIdRef.current,
        screenX: window.screenX || window.screenLeft || 0,
        screenY: window.screenY || window.screenTop || 0,
        width: window.innerWidth,
        height: window.innerHeight,
        updatedAt: Date.now()
      };
      localStorage.setItem(`rspw_win_${windowIdRef.current}`, JSON.stringify(meta));
    };

    // Initial Registration
    announceWindow();

    // Regular Heartbeat + cleanup of dead windows
    const heartbeatInterval = setInterval(() => {
      announceWindow();
      
      // Clean up dead windows & read active ones
      const now = Date.now();
      const collectedWindows: WindowMeta[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('rspw_win_')) {
          try {
            const dataStr = localStorage.getItem(key);
            if (dataStr) {
              const winData = JSON.parse(dataStr) as WindowMeta;
              // If updated in the last 2.5 seconds, it's alive
              if (now - winData.updatedAt < 2500) {
                collectedWindows.push(winData);
              } else {
                localStorage.removeItem(key);
              }
            }
          } catch (e) {
            // failed parsing
          }
        }
      }

      // Sort by creation or ID to maintain list order
      collectedWindows.sort((a,b) => a.id.localeCompare(b.id));
      setActiveWindows(collectedWindows);
    }, 500);

    // Clean up on unmount
    const handleUnload = () => {
      localStorage.removeItem(`rspw_win_${windowIdRef.current}`);
      
      // If this window is holding any balls, release them to other windows
      const nowBalls = ballsRef.current;
      const otherAliveWins = activeWindowsRef.current.filter(w => w.id !== windowIdRef.current);
      if (otherAliveWins.length > 0 && nowBalls.length > 0) {
        const backupOwner = otherAliveWins[0].id;
        const transferred = nowBalls.map(b => {
          if (b.ownerId === windowIdRef.current) {
            return { ...b, ownerId: backupOwner };
          }
          return b;
        });
        localStorage.setItem('rspw_shared_balls', JSON.stringify(transferred));
        
        // Notify other windows
        const bc = new BroadcastChannel('rspw_cross_window_channel');
        bc.postMessage({ type: 'BALLS_UPDATE', balls: transferred });
        bc.close();
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('resize', announceWindow);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('resize', announceWindow);
      localStorage.removeItem(`rspw_win_${windowIdRef.current}`);
    };
  }, []);

  // 2. BROADCAST CHANNEL & CENTRAL STATE SYNC FOR REAL-TIME FLOW
  useEffect(() => {
    const bc = new BroadcastChannel('rspw_cross_window_channel');

    const handleMessage = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === 'BALLS_UPDATE') {
        const incomingBalls = e.data.balls as SharedBall[];
        
        // Filter out balls that we claim ownership of, because we are simulating them
        const localSimulatedIds = ballsRef.current
          .filter(b => b.ownerId === windowIdRef.current)
          .map(b => b.id);

        const merged = incomingBalls.map(incomingBall => {
          if (localSimulatedIds.includes(incomingBall.id)) {
            // keep our local simulation
            return ballsRef.current.find(b => b.id === incomingBall.id)!;
          }
          return incomingBall;
        });

        // Add any missing balls we didn't know about
        const mergedIds = merged.map(b => b.id);
        const missing = incomingBalls.filter(b => !mergedIds.includes(b.id));

        setBalls([...merged, ...missing]);
      } else if (e.data.type === 'SOUND_BOUNCE') {
        playCollisionSound();
      } else if (e.data.type === 'SPAWN_BALL') {
        const b = e.data.ball as SharedBall;
        setBalls(prev => [...prev, b]);
      } else if (e.data.type === 'CLEAR_BALLS') {
        setBalls([]);
      } else if (e.data.type === 'REWARD_CLAIMED') {
        setStatsRewarded(true);
      }
    };

    bc.addEventListener('message', handleMessage);

    // Load initial balls from localStorage
    try {
      const savedBalls = localStorage.getItem('rspw_shared_balls');
      if (savedBalls) {
        setBalls(JSON.parse(savedBalls));
      } else {
        // Seed default balls if none exist
        const initialBalls: SharedBall[] = [
          {
            id: 'b1',
            type: 'rock',
            screenX: (window.screenX || 0) + 100,
            screenY: (window.screenY || 0) + 120,
            vx: 3,
            vy: -2,
            radius: 18,
            ownerId: windowIdRef.current
          },
          {
            id: 'b2',
            type: 'scissors',
            screenX: (window.screenX || 0) + 180,
            screenY: (window.screenY || 0) + 180,
            vx: -4,
            vy: 3,
            radius: 18,
            ownerId: windowIdRef.current
          },
          {
            id: 'b3',
            type: 'paper',
            screenX: (window.screenX || 0) + 260,
            screenY: (window.screenY || 0) + 140,
            vx: 3.5,
            vy: 4,
            radius: 18,
            ownerId: windowIdRef.current
          }
        ];
        setBalls(initialBalls);
        localStorage.setItem('rspw_shared_balls', JSON.stringify(initialBalls));
      }
    } catch (e) {
      // localstorage error
    }

    return () => {
      bc.removeEventListener('message', handleMessage);
      bc.close();
    };
  }, []);

  // 3. ACTION LOOP (requestAnimationFrame) FOR PHYSICS INTEGRATION
  useEffect(() => {
    let animationId: number;

    const bc = new BroadcastChannel('rspw_cross_window_channel');

    const updatePhysics = () => {
      const nowBalls = [...ballsRef.current];
      const winId = windowIdRef.current;
      
      const screenX = window.screenX || window.screenLeft || 0;
      const screenY = window.screenY || window.screenTop || 0;
      const width = window.innerWidth;
      const height = window.innerHeight;

      const activeWins = activeWindowsRef.current;

      let stateChanged = false;
      let hasBounceHappened = false;

      // Helper to check if a screen coordinate belongs to any active window
      const findContainingWindow = (x: number, y: number): WindowMeta | null => {
        for (const win of activeWins) {
          if (
            x >= win.screenX &&
            x <= win.screenX + win.width &&
            y >= win.screenY &&
            y <= win.screenY + win.height
          ) {
            return win;
          }
        }
        return null;
      };

      // Update positions of balls we own
      const updatedBalls = nowBalls.map(ball => {
        // If we don't own this ball, just let it glide or wait for owner updates
        if (ball.ownerId !== winId) {
          return ball;
        }

        stateChanged = true;

        // Apply physics config: Gravity slows/accelerates depending on weapon style
        let gravity = 0;
        let p1MoveResistance = 0.998; // General atmospheric friction
        
        if (gravityEnabled) {
          if (ball.type === 'rock') {
            gravity = 0.28; // Rock is heavy and drops fast
            p1MoveResistance = 0.995;
          } else if (ball.type === 'well') {
            gravity = 0.05; // Well floats with subtle drift
          } else if (ball.type === 'scissors') {
            gravity = 0.15; // Scissors fall normally
          } else if (ball.type === 'paper') {
            gravity = 0.08; // Paper floats lightly
          }
        }

        // New temporary velocity
        let nvx = ball.vx * p1MoveResistance;
        let nvy = ball.vy * p1MoveResistance + gravity;

        // Clip maximum velocities
        const maxV = 16;
        nvx = Math.max(-maxV, Math.min(maxV, nvx));
        nvy = Math.max(-maxV, Math.min(maxV, nvy));

        // Let's compute next absolute space coords
        let nScreenX = ball.screenX + nvx;
        let nScreenY = ball.screenY + nvy;

        // Detect window borders relative to our own window space
        const leftMin = screenX + ball.radius;
        const rightMax = screenX + width - ball.radius;
        const topMin = screenY + ball.radius;
        const bottomMax = screenY + height - ball.radius;

        // Edge checks with smart cross-window portals
        // 1. LEFT Border
        if (nScreenX < leftMin) {
          if (portalOpen) {
            const nextWindow = findContainingWindow(screenX - 8, nScreenY);
            if (nextWindow) {
              // Smooth transfer: change owner & keep traversing
              ball.ownerId = nextWindow.id;
            } else {
              // Regular bounce
              nScreenX = leftMin;
              nvx = -nvx * 0.85; // bounce energy loss
              hasBounceHappened = true;
            }
          } else {
            nScreenX = leftMin;
            nvx = -nvx * 0.85;
            hasBounceHappened = true;
          }
        }

        // 2. RIGHT Border
        if (nScreenX > rightMax) {
          if (portalOpen) {
            const nextWindow = findContainingWindow(screenX + width + 8, nScreenY);
            if (nextWindow) {
              ball.ownerId = nextWindow.id;
            } else {
              nScreenX = rightMax;
              nvx = -nvx * 0.85;
              hasBounceHappened = true;
            }
          } else {
            nScreenX = rightMax;
            nvx = -nvx * 0.85;
            hasBounceHappened = true;
          }
        }

        // 3. TOP Border
        if (nScreenY < topMin) {
          if (portalOpen) {
            const nextWindow = findContainingWindow(nScreenX, screenY - 8);
            if (nextWindow) {
              ball.ownerId = nextWindow.id;
            } else {
              nScreenY = topMin;
              nvy = -nvy * 0.85;
              hasBounceHappened = true;
            }
          } else {
            nScreenY = topMin;
            nvy = -nvy * 0.85;
            hasBounceHappened = true;
          }
        }

        // 4. BOTTOM Border
        if (nScreenY > bottomMax) {
          if (portalOpen) {
            const nextWindow = findContainingWindow(nScreenX, screenY + height + 8);
            if (nextWindow) {
              ball.ownerId = nextWindow.id;
            } else {
              nScreenY = bottomMax;
              nvy = -nvy * 0.85;
              hasBounceHappened = true;
            }
          } else {
            nScreenY = bottomMax;
            nvy = -nvy * 0.85;
            hasBounceHappened = true;
          }
        }

        ball.screenX = nScreenX;
        ball.screenY = nScreenY;
        ball.vx = nvx;
        ball.vy = nvy;

        return ball;
      });

      // 4. INTER-BALL COLLISIONS & COMBAT (ONLY WEAPONS OWNED BY US COMPUTE ENCOUNTERS)
      for (let i = 0; i < updatedBalls.length; i++) {
        const b1 = updatedBalls[i];
        if (b1.ownerId !== winId) continue;

        for (let j = 0; j < updatedBalls.length; j++) {
          if (i === j) continue;
          const b2 = updatedBalls[j];

          // Compute absolute distance between centers
          const dx = b2.screenX - b1.screenX;
          const dy = b2.screenY - b1.screenY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = b1.radius + b2.radius;

          if (dist < minDist) {
            // Colliding! Apply subtle elastic bounce
            const normalX = dx / dist;
            const normalY = dy / dist;

            // Push apart slightly to prevent clipping sticking
            const overlap = minDist - dist;
            b1.screenX -= normalX * overlap * 0.5;
            b1.screenY -= normalY * overlap * 0.5;

            // Elastic bounce velocities
            const kx = b1.vx - b2.vx;
            const ky = b1.vy - b2.vy;
            const p = 2 * (normalX * kx + normalY * ky) / 2;

            b1.vx -= normalX * p * 0.9;
            b1.vy -= normalY * p * 0.9;
            
            if (b2.ownerId === winId) {
              b2.vx += normalX * p * 0.9;
              b2.vy += normalY * p * 0.9;
            }

            hasBounceHappened = true;

            // COMBAT RULE RESOLUTIONS (👊 stone beats ✂️ scissor, ✂️ scissor beats 📄 paper, 📄 paper beats 🕳️ holes, 🕳️ holes beats 👊 stone & ✂️ scissor)
            if (b1.type !== b2.type) {
              let winnerType: WeaponType | null = null;
              
              if (
                (b1.type === 'rock' && b2.type === 'scissors') ||
                (b1.type === 'scissors' && b2.type === 'rock')
              ) {
                winnerType = 'rock';
              } else if (
                (b1.type === 'scissors' && b2.type === 'paper') ||
                (b1.type === 'paper' && b2.type === 'scissors')
              ) {
                winnerType = 'scissors';
              } else if (
                (b1.type === 'paper' && b2.type === 'well') ||
                (b1.type === 'well' && b2.type === 'paper')
              ) {
                winnerType = 'paper';
              } else if (
                (b1.type === 'well' && b1.type !== 'paper') ||
                (b2.type === 'well' && b2.type !== 'paper')
              ) {
                winnerType = 'well';
              }

              if (winnerType) {
                // If there's a type shift, update stats and log event!
                if (b1.type !== winnerType) {
                  b1.type = winnerType;
                  statisticsRef.current.conversions += 1;
                  if (winnerType === 'well') statisticsRef.current.wellAbsorbs += 1;
                }
                if (b2.type !== winnerType) {
                  b2.type = winnerType;
                  statisticsRef.current.conversions += 1;
                  if (winnerType === 'well') statisticsRef.current.wellAbsorbs += 1;
                }
                stateChanged = true;
              }
            }
          }
        }
      }

      if (hasBounceHappened) {
        statisticsRef.current.totalBounces += 1;
        playCollisionSound();
        bc.postMessage({ type: 'SOUND_BOUNCE' });
      }

      if (stateChanged) {
        setBalls(updatedBalls);
        // Persist to local storage in case a new tab opens
        localStorage.setItem('rspw_shared_balls', JSON.stringify(updatedBalls));
        // Push state in real-time to other windows
        bc.postMessage({ type: 'BALLS_UPDATE', balls: updatedBalls });
      }

      setCollisionStats({ ...statisticsRef.current });

      // Trigger standard render on canvas
      renderCanvas();

      animationId = requestAnimationFrame(updatePhysics);
    };

    const renderCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const screenX = window.screenX || window.screenLeft || 0;
      const screenY = window.screenY || window.screenTop || 0;
      const width = canvas.width;
      const height = canvas.height;

      // Draw background design
      ctx.clearRect(0, 0, width, height);

      // Draw a subtle coordinate grid representing screen-space alignment
      ctx.strokeStyle = 'rgba(51, 144, 236, 0.05)';
      ctx.lineWidth = 1;
      const gridSpacing = 40;
      const gridOffsetX = screenX % gridSpacing;
      const gridOffsetY = screenY % gridSpacing;

      for (let x = -gridOffsetX; x < width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = -gridOffsetY; y < height; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw active window borders in other colors for a beautiful viewport visualization
      activeWindowsRef.current.forEach(win => {
        if (win.id === windowIdRef.current) return;

        // Calculate relative coordinates of other windows
        const rx = win.screenX - screenX;
        const ry = win.screenY - screenY;

        ctx.strokeStyle = 'rgba(236, 72, 153, 0.25)'; // Pink neon outline
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.rect(rx, ry, win.width, win.height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label for other viewports
        ctx.fillStyle = 'rgba(236, 72, 153, 0.45)';
        ctx.font = '10px monospace';
        ctx.fillText(`Connected Tab ${win.id.toUpperCase()}`, rx + 12, ry + 22);
      });

      // Render the shared balls
      ballsRef.current.forEach(ball => {
        // Find relative coordinates to this window's upper-left corner
        const rx = ball.screenX - screenX;
        const ry = ball.screenY - screenY;

        // Render trails or glows around the ball
        const gradient = ctx.createRadialGradient(rx, ry, 2, rx, ry, ball.radius * 2);
        const col = WEAPON_COLORS[ball.type];
        gradient.addColorStop(0, `${col}55`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(rx, ry, ball.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Base Ball
        ctx.fillStyle = '#17212b';
        ctx.strokeStyle = col;
        ctx.lineWidth = ball.ownerId === windowIdRef.current ? 3 : 1.5;
        
        ctx.beginPath();
        ctx.arc(rx, ry, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw weapon emoji
        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(WEAPON_EMOJIS[ball.type], rx, ry);

        // Highlight indicator for the active simulation leader
        if (ball.ownerId === windowIdRef.current) {
          ctx.strokeStyle = 'rgba(51, 144, 236, 0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(rx, ry, ball.radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    };

    // Keep canvas dimensions synced
    const syncCanvasDims = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };

    syncCanvasDims();
    window.addEventListener('resize', syncCanvasDims);

    // Run physics
    animationId = requestAnimationFrame(updatePhysics);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', syncCanvasDims);
      bc.close();
    };
  }, [gravityEnabled, portalOpen]);

  // 5. INTERACTORS
  const spawnNewBall = () => {
    playClickSound();
    const typeList: WeaponType[] = ['rock', 'scissors', 'paper', 'well'];
    const randomType = typeList[Math.floor(Math.random() * typeList.length)];
    
    // Spawn neat center of current viewport
    const screenX = window.screenX || window.screenLeft || 0;
    const screenY = window.screenY || window.screenTop || 0;
    
    const newBall: SharedBall = {
      id: 'b_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: randomType,
      screenX: screenX + window.innerWidth / 2 + (Math.random() * 60 - 30),
      screenY: screenY + window.innerHeight / 2 + (Math.random() * 60 - 30),
      vx: (Math.random() * 6 + 2) * (Math.random() > 0.5 ? 1 : -1),
      vy: (Math.random() * 4 - 2),
      radius: 18,
      ownerId: windowId
    };

    const updated = [...balls, newBall];
    setBalls(updated);
    localStorage.setItem('rspw_shared_balls', JSON.stringify(updated));

    // Broadcast spawn
    const bc = new BroadcastChannel('rspw_cross_window_channel');
    bc.postMessage({ type: 'SPAWN_BALL', ball: newBall });
    bc.close();
  };

  const clearAllBalls = () => {
    playClickSound();
    setBalls([]);
    localStorage.removeItem('rspw_shared_balls');

    const bc = new BroadcastChannel('rspw_cross_window_channel');
    bc.postMessage({ type: 'CLEAR_BALLS' });
    bc.close();
  };

  const spawnConnectedWindow = () => {
    playClickSound();
    const width = 360;
    const height = 400;
    
    // Position floating offsets nicely next to current tab
    const screenX = window.screenX || window.screenLeft || 0;
    const screenY = window.screenY || window.screenTop || 0;
    const left = screenX + window.innerWidth + 20;
    const top = screenY;

    window.open(
      `${window.location.origin}${window.location.pathname}?tab=windows&popup=true`,
      `win_popup_${Date.now()}`,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,location=no`
    );
  };

  // Check achievements - when conversion score hits 20, offer wins reward
  const handleClaimChallengeReward = () => {
    if (collisionStats.conversions >= 20 && !statsRewarded) {
      onRewardWins(5); // Add 5 real Wins to player profile database
      setStatsRewarded(true);
      playClickSound();
      
      const bc = new BroadcastChannel('rspw_cross_window_channel');
      bc.postMessage({ type: 'REWARD_CLAIMED' });
      bc.close();
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Header Banner */}
      <div className="bg-[#17212b] border border-[#242f3d] p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-[#3390ec] font-bold text-sm">
            <Layers className="w-4 h-4 animate-bounce" />
            <span className="uppercase tracking-widest text-[11px]">Dynamic Multi-Window</span>
          </div>
          <h2 className="text-xl font-black text-white mt-1 leading-tight">Cross-Window Arena</h2>
          <p className="text-[#708499] text-xs mt-1 max-w-sm">
            Open multiple browser tabs or popup windows, arrange them side by side, and watch weapons bounce and traverse between screens in real-time!
          </p>
        </div>

        <button
          id="btn_spawn_connected_window"
          onClick={spawnConnectedWindow}
          className="bg-[#3390ec] hover:bg-[#2b7ad0] text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shrink-0 self-stretch sm:self-auto cursor-pointer"
        >
          <ExternalLink className="w-4 h-4" /> Floating Window
        </button>
      </div>

      {/* Physics Canvas Stage */}
      <div 
        ref={containerRef}
        className="w-full h-72 bg-[#0e1621] border border-[#242f3d] rounded-3xl relative overflow-hidden flex flex-col items-center justify-center cursor-crosshair shadow-inner"
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        
        {/* Canvas HUD overlays */}
        <div className="absolute top-3 left-3 flex items-center space-x-1 bg-black/60 backdrop-blur-md border border-white/5 py-1 px-2.5 rounded-full z-10 select-none">
          <Laptop className="w-3.5 h-3.5 text-[#3390ec]" />
          <span className="text-[10px] uppercase font-mono tracking-wider text-white">This Tab:</span>
          <span className="text-[10px] font-bold font-mono text-[#3390ec] uppercase">{windowId.toUpperCase()}</span>
        </div>

        <div className="absolute top-3 right-3 flex items-center space-x-2 bg-black/60 backdrop-blur-md border border-white/5 py-1 px-2.5 rounded-full z-10">
          <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span className="text-[10px] text-white/90">
            Tabs Active: <b className="text-[#3390ec]">{activeWindows.length}</b>
          </span>
        </div>

        {balls.length === 0 && (
          <div className="absolute text-center p-6 bg-[#17212b]/95 border border-[#2b3745] rounded-2xl max-w-xs z-10 pointer-events-none">
            <Dribbble className="w-8 h-8 text-[#708499] mx-auto mb-2 animate-spin" />
            <p className="text-white text-xs font-bold">No active weapons on screen</p>
            <p className="text-[#708499] text-[10px] mt-1">Tap below to spawn and seed rock, paper, scissors, or wells into the arena.</p>
          </div>
        )}
      </div>

      {/* Physics Settings and Spawners */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          onClick={spawnNewBall}
          className="bg-[#242f3d] hover:bg-[#2c3a4a] border border-[#2b3745] text-white py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-[#3390ec]/10 flex items-center justify-center">
            <Plus className="w-4 h-4 text-[#3390ec]" />
          </div>
          Spawn Weapon
        </button>

        <button
          onClick={() => { playClickSound(); setGravityEnabled(!gravityEnabled); }}
          className={`border py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer ${
            gravityEnabled 
              ? 'bg-[#3390ec]/10 border-[#3390ec]/30 text-white' 
              : 'bg-[#242f3d] border-[#2b3745] text-[#708499]'
          }`}
        >
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${gravityEnabled ? 'bg-[#3390ec]/20' : 'bg-[#708499]/10'}`}>
            <Sparkles className={`w-4 h-4 ${gravityEnabled ? 'text-[#3390ec]' : 'text-[#708499]'}`} />
          </div>
          {gravityEnabled ? 'Gravity ON' : 'Gravity OFF'}
        </button>

        <button
          onClick={() => { playClickSound(); setPortalOpen(!portalOpen); }}
          className={`border py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer ${
            portalOpen 
              ? 'bg-[#ec4899]/10 border-[#ec4899]/30 text-white' 
              : 'bg-[#242f3d] border-[#2b3745] text-[#708499]'
          }`}
        >
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${portalOpen ? 'bg-[#ec4899]/20' : 'bg-[#708499]/10'}`}>
            <ExternalLink className={`w-4 h-4 ${portalOpen ? 'text-[#ec4899]' : 'text-[#708499]'}`} />
          </div>
          {portalOpen ? 'Portals ON' : 'Portals OFF'}
        </button>

        <button
          onClick={clearAllBalls}
          className="bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 text-red-400 py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          Clear Arena
        </button>
      </div>

      {/* Real-time Interaction Scoreboard & Dynamic Win rewards */}
      <div className="bg-[#17212b] border border-[#242f3d] p-5 rounded-3xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          Arena Fusion Achievements
        </h3>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
            <span className="text-[10px] text-[#708499] block font-mono">Conversions</span>
            <span className="text-xl font-extrabold text-white font-mono">{collisionStats.conversions}</span>
          </div>
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
            <span className="text-[10px] text-[#708499] block font-mono">Absorbed by Wells</span>
            <span className="text-xl font-extrabold text-[#3b82f6] font-mono">{collisionStats.wellAbsorbs}</span>
          </div>
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
            <span className="text-[10px] text-[#708499] block font-mono">Total Bounces</span>
            <span className="text-xl font-extrabold text-emerald-400 font-mono">{collisionStats.totalBounces}</span>
          </div>
        </div>

        {/* Challenge Box */}
        <div className="p-4 bg-[#242f3d]/50 border border-[#2b3745] rounded-2xl flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <p className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>🎯</span> Multi-Window Constructor
            </p>
            <p className="text-[#708499] text-[10px] mt-0.5 leading-snug">
              Achieve <b>20 conversions</b> of bouncing weapons in the physics stage to earn +5 Wins instantly!
            </p>
          </div>

          <div>
            {statsRewarded ? (
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-2 px-3.5 rounded-xl text-xs font-bold block whitespace-nowrap">
                ✓ Claimed +5 Wins
              </span>
            ) : (
              <button
                id="btn_claim_multiwindow_reward"
                onClick={handleClaimChallengeReward}
                disabled={collisionStats.conversions < 20}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold transition block whitespace-nowrap cursor-pointer ${
                  collisionStats.conversions >= 20
                    ? 'bg-yellow-400 hover:bg-yellow-500 text-black shadow-lg shadow-yellow-400/10'
                    : 'bg-white/5 text-[#708499] cursor-not-allowed border border-white/5'
                }`}
              >
                Claim reward ({Math.min(20, collisionStats.conversions)}/20)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Guide explanation */}
      <div className="bg-[#242f3d]/20 border border-[#2b3745]/40 rounded-2xl p-4 flex items-start space-x-3 text-[11px] text-[#708499] leading-relaxed">
        <Info className="w-5 h-5 text-[#3390ec] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-white font-bold">How does the screen integration work?</p>
          <p>
            When multiple windows of this application are open, they announce their local monitor space bounds via <code className="text-xs font-bold text-slate-300">BroadcastChannel</code> and <code className="text-xs font-bold text-slate-300">localStorage</code>.
          </p>
          <p>
            When a bouncing weapon crosses your window boundary, it detects the adjacent window, updates the global coordinate, and seamlessly passes ownership of the weapon's physics calculation to that window context. Enjoy drag-and-drop multitasking gaming!
          </p>
        </div>
      </div>

    </div>
  );
}
