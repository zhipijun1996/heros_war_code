import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type { GameState, Card, TableCard, Token, Counter, Player, ImageConfig } from './src/types.ts';

let heroesDatabase: any = null;
async function fetchHeroesDatabase() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/zhipijun1996/heros_war/main/heroes.json');
    heroesDatabase = await response.json();
    console.log('Heroes database loaded');
  } catch (e) {
    console.error('Failed to load heroes database', e);
  }
}
fetchHeroesDatabase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION FOR DEVELOPER ---
const BASE_URL = 'https://raw.githubusercontent.com/zhipijun1996/heros_war/main/';

const TREASURE1_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_t1.png`;
const TREASURE2_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8Ct2.png`;
const TREASURE3_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_t3.png`;
const ACTION_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E5%85%AC%E5%85%B1%E7%89%8C%E5%A0%86.png`;
const HERO1_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv1.png`;
const HERO2_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv2.png`;
const HERO3_BACK = `${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv3.png`;

const HERO_CLASSES = [
  '重甲兵', '巨盾卫士', '战士', '狂战士', '决斗大师', '刺客', '盗贼', 
  '弓箭手', '冰法师', '火法师', '圣职者', '指挥官'
];

// --- HERO IMAGES CONFIGURATION ---
const getHeroTokenImage = (heroClass: string) => {
  return `${BASE_URL}token_${encodeURIComponent(heroClass)}.png`;
};

const getHeroCardImage = (heroClass: string, level: number) => {
  if (heroClass === '圣职者' && level === 2) return `${BASE_URL}%E5%9C%A3%E8%81%8C%E8%80%85_LV2.png`;
  if (heroClass === '重甲兵' && level === 2) return `${BASE_URL}%E9%87%8D%E7%94%B2%E5%85%B5_LV2.png`;
  return `${BASE_URL}${encodeURIComponent(heroClass)}lv${level}.png`;
};

const getHeroBackImage = (level: number) => {
  if (level === 1) return HERO1_BACK;
  if (level === 2) return HERO2_BACK;
  return HERO3_BACK;
};

const generateId = () => Math.random().toString(36).substring(2, 9);

const T1_CARDS = ['冲刺卷轴', '治疗药水', '移动号角', '经验卷轴', '远程战术', '防御符文'].map(n => `${BASE_URL}t1_${encodeURIComponent(n)}.png`);
const T2_CARDS = ['侦察镜', '战术盾', '战术腰带', '指挥旗', '防御手套', '骑士战靴'].map(n => `${BASE_URL}t2_${encodeURIComponent(n)}.png`);
const T3_CARDS = ['战场旗帜', '战术望远镜', '战马', '重装铠甲'].map(n => `${BASE_URL}t3_${encodeURIComponent(n)}.png`);

const ACTION_CARDS_CONFIG = [
  { name: '行动', copies: 30 },
  { name: '防御', copies: 8 },
  { name: '冲刺', copies: 3 },
  { name: '回复', copies: 3 },
  { name: '强击', copies: 3 },
  { name: '间谍', copies: 3 },
];

const MONSTER_CELLS = [
  { q: -2, r: 4 }, { q: 2, r: 2 }, { q: -2, r: -2 }, { q: 2, r: -4 }, // M1
  { q: -3, r: 3 }, { q: -1, r: 1 }, { q: 3, r: -3 }, { q: 1, r: -1 }, // M2
  { q: -3, r: 1 }, { q: 3, r: -1 } // M3
];

const CHEST_HEXES = [
  { q: 0, r: 0 }, { q: -4, r: 2 }, { q: 4, r: -2 }, { q: -4, r: 4 }, { q: 4, r: -4 }
];

const createActionDeck = (): Card[] => {
  const deck: Card[] = [];
  ACTION_CARDS_CONFIG.forEach(config => {
    const url = `${BASE_URL}%E5%85%AC%E5%85%B1_${encodeURIComponent(config.name)}.png`;
    for (let i = 0; i < config.copies; i++) {
      deck.push({
        id: generateId(),
        frontImage: url,
        backImage: ACTION_BACK,
        type: 'action',
        name: config.name,
      });
    }
  });
  return deck.sort(() => Math.random() - 0.5);
};

const createHeroDeck = (): Card[] => {
  const deck: Card[] = HERO_CLASSES.map(heroClass => ({
    id: generateId(),
    frontImage: getHeroCardImage(heroClass, 1),
    backImage: HERO1_BACK,
    type: 'hero',
    heroClass: heroClass,
    level: 1,
  }));
  return deck.sort(() => Math.random() - 0.5);
};

const createSpecificDeck = (type: string, back: string, urls: string[], copies: number): Card[] => {
  const deck: Card[] = [];
  urls.forEach(url => {
    for (let i = 0; i < copies; i++) {
      deck.push({
        id: generateId(),
        frontImage: url,
        backImage: back,
        type: type as any,
      });
    }
  });
  return deck.sort(() => Math.random() - 0.5);
};

const createInitialState = (): GameState => {
  const state: GameState = {
    gameStarted: false,
    seats: [null, null, null, null],
    players: {},
    tokens: [],
    tableCards: [],
    hireAreaCards: [],
    playAreaCards: [],
    decks: {
      treasure1: createSpecificDeck('treasure1', TREASURE1_BACK, T1_CARDS, 2), // 12 cards
      treasure2: createSpecificDeck('treasure2', TREASURE2_BACK, T2_CARDS, 2), // 12 cards
      treasure3: createSpecificDeck('treasure3', TREASURE3_BACK, T3_CARDS, 1), // 4 cards
      action: createActionDeck(), // 50 cards
      hero: createHeroDeck(), // 12 LV1 heroes
    },
    discardPiles: {
      action: [],
    },
    counters: [
      { id: generateId(), type: 'gold', x: -150, y: 550, value: 0 },
      { id: generateId(), type: 'gold', x: -150, y: -700, value: 0 }
    ],
    imageConfig: {
      heroTokens: [], heroCards: [], actionCards: [], t1Cards: [], t2Cards: [], t3Cards: []
    },
    heroPlayed: {},
    round: 1,
    firstPlayerIndex: 0,
    activePlayerIndex: 0,
    phase: 'setup',
    consecutivePasses: 0,
    selectedOption: null,
    selectedTokenId: null,
    remainingMv: 0,
    reachableCells: [],
    castleHP: { 0: 3, 1: 3 },
    logs: [],
  };

  const drawToTable = (deckType: keyof GameState['decks'], count: number, startX: number, startY: number) => {
    for (let i = 0; i < count; i++) {
      if (state.decks[deckType].length > 0) {
        const card = state.decks[deckType].pop()!;
        state.tableCards.push({
          ...card,
          x: startX - (i + 1) * 120,
          y: startY,
          faceUp: true
        });
      }
    }
  };

  drawToTable('treasure1', 4, -500, -200);
  drawToTable('treasure2', 3, -500, 0);
  drawToTable('treasure3', 2, -500, 200);

  return state;
};

let gameState = createInitialState();

const HEX_SIZE = 45;

function hexRound(q: number, r: number) {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(-q - r);
  const q_diff = Math.abs(rq - q);
  const r_diff = Math.abs(rr - r);
  const s_diff = Math.abs(rs - (-q - r));
  if (q_diff > r_diff && q_diff > s_diff) {
      rq = -rr - rs;
  } else if (r_diff > s_diff) {
      rr = -rq - rs;
  }
  return { q: rq, r: rr };
}

function hexDistance(q1: number, r1: number, q2: number, r2: number) {
  const s1 = -q1 - r1;
  const s2 = -q2 - r2;
  return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
}

function pixelToHex(x: number, y: number) {
  const q = (2/3 * x) / HEX_SIZE;
  const r = (-1/3 * x + Math.sqrt(3)/3 * y) / HEX_SIZE;
  return hexRound(q, r);
}

function hexToPixel(q: number, r: number) {
  const x = HEX_SIZE * 1.5 * q;
  const y = HEX_SIZE * Math.sqrt(3) * (r + q/2);
  return { x, y };
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  const PORT = 3000;

  const alignHireArea = () => {
    const startX = 140;
    const startY = -500;
    gameState.hireAreaCards.forEach((card, i) => {
      card.x = startX + (i % 6) * 110;
      card.y = startY - Math.floor(i / 6) * 160;
      card.faceUp = true;
    });
  };

  const addLog = (message: string, playerIndex: number = -1) => {
  const log: any = {
    id: generateId(),
    round: gameState.round,
    playerIndex,
    message,
    timestamp: Date.now()
  };
  gameState.logs.push(log);
  if (gameState.logs.length > 100) {
    gameState.logs.shift();
  }
};

const broadcastState = () => {
    io.emit('state_update', gameState);
  };

  const getNeighbors = (q: number, r: number) => [
    { q: q + 1, r: r }, { q: q + 1, r: r - 1 }, { q: q, r: r - 1 },
    { q: q - 1, r: r }, { q: q - 1, r: r + 1 }, { q: q, r: r + 1 }
  ];

  const MONSTER_HEXES = [
    { q: -2, r: 4, level: 1, icon: "👾" },
    { q: 2, r: 2, level: 1, icon: "👾" },
    { q: -2, r: -2, level: 1, icon: "👾" },
    { q: 2, r: -4, level: 1, icon: "👾" },
    { q: -3, r: 3, level: 2, icon: "💀" },
    { q: -1, r: 1, level: 2, icon: "💀" },
    { q: 3, r: -3, level: 2, icon: "💀" },
    { q: 1, r: -1, level: 2, icon: "💀" },
    { q: -3, r: 1, level: 3, icon: "🐉" },
    { q: 3, r: -1, level: 3, icon: "🐉" },
  ];

  const calculateAttackableCells = (startQ: number, startR: number, ar: number, playerIndex: number) => {
    const cells: {q: number, r: number}[] = [];
    const radius = 4;
    for (let dq = -ar; dq <= ar; dq++) {
      for (let dr = Math.max(-ar, -dq - ar); dr <= Math.min(ar, -dq + ar); dr++) {
        const nq = startQ + dq;
        const nr = startR + dr;
        if (Math.abs(nq) <= radius && Math.abs(nr) <= radius && Math.abs(-nq - nr) <= radius) {
          let hasTarget = false;
          
          // 1. Alive monster
          const monster = MONSTER_HEXES.find(m => m.q === nq && m.r === nr);
          if (monster) {
             const pos = hexToPixel(nq, nr);
             const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
             if (!hasTimer) hasTarget = true;
          }
          
          // 2. Enemy hero
          if (!hasTarget) {
            const enemyTokens = gameState.tokens.filter(t => {
               const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
               if (!card) return false;
               const isEnemy = playerIndex === 0 ? card.y < 0 : card.y > 0;
               if (!isEnemy) return false;
               const hex = pixelToHex(t.x, t.y);
               return hex.q === nq && hex.r === nr;
            });
            if (enemyTokens.length > 0) {
               hasTarget = true;
            }
          }

          // 3. Enemy castle
          if (!hasTarget) {
            const enemyCastleHex = { q: 0, r: playerIndex === 0 ? -4 : 4 };
            if (nq === enemyCastleHex.q && nr === enemyCastleHex.r) {
              hasTarget = true;
            }
          }
          
          if (hasTarget) {
            cells.push({q: nq, r: nr});
          }
        }
      }
    }
    return cells;
  };

  const calculateReachableCells = (startQ: number, startR: number, mv: number, playerIndex: number) => {
    const reachable = new Set<string>();
    const queue = [{ q: startQ, r: startR, dist: 0 }];
    const visited = new Set<string>();
    visited.add(`${startQ},${startR}`);

    while (queue.length > 0) {
      const { q, r, dist } = queue.shift()!;
      if (dist > 0) reachable.add(`${q},${r}`);
      if (dist < mv) {
        for (const neighbor of getNeighbors(q, r)) {
          const key = `${neighbor.q},${neighbor.r}`;
          if (!visited.has(key) && Math.abs(neighbor.q) <= 4 && Math.abs(neighbor.r) <= 4 && Math.abs(-neighbor.q - neighbor.r) <= 4) {
            // Check for obstacles
            const isMonster = MONSTER_CELLS.some(m => m.q === neighbor.q && m.r === neighbor.r);
            const hasTimeCounter = gameState.counters.some(c => c.type === 'time' && pixelToHex(c.x, c.y).q === neighbor.q && pixelToHex(c.x, c.y).r === neighbor.r);
            const hasOtherToken = gameState.tokens.some(t => {
              const th = pixelToHex(t.x, t.y);
              return th.q === neighbor.q && th.r === neighbor.r;
            });
            
            // Enemy castle is also an obstacle
            const enemyCastleQ = 0;
            const enemyCastleR = playerIndex === 0 ? -4 : 4;
            const isEnemyCastle = neighbor.q === enemyCastleQ && neighbor.r === enemyCastleR;
            
            if ((isMonster && !hasTimeCounter) || hasOtherToken || isEnemyCastle) {
              // Obstacle
              continue;
            }
            
            visited.add(key);
            queue.push({ ...neighbor, dist: dist + 1 });
          }
        }
      }
    }
    return Array.from(reachable).map(s => {
      const [q, r] = s.split(',').map(Number);
      return { q, r };
    });
  };

  const checkBotTurn = () => {
    if (!gameState.gameStarted) return;

    const phase = gameState.phase;

    if (phase === 'discard') {
      let anyChange = false;
      gameState.seats.filter(id => id !== null).forEach(id => {
        const player = gameState.players[id!];
        if (player?.isBot && !player.discardFinished) {
          console.log(`Bot ${id} discarding, hand length: ${player.hand.length}`);
          const botSocket = { id: id!, emit: () => {}, broadcast: { emit: () => {} } };
          while (player.hand.length > 5) {
            const cardToDiscard = player.hand[Math.floor(Math.random() * player.hand.length)];
            handlers.discard_card(botSocket, cardToDiscard.id);
            anyChange = true;
          }
          handlers.finish_discard(botSocket);
          anyChange = true;
        }
      });
      return;
    }

    const activePlayerId = gameState.seats[gameState.activePlayerIndex];
    if (activePlayerId && gameState.players[activePlayerId]?.isBot) {
      addLog(`Bot ${activePlayerId} turn start in phase ${gameState.phase}`, -1);
      setTimeout(() => {
        if (!gameState.gameStarted) return;
        const currentActiveId = gameState.seats[gameState.activePlayerIndex];
        if (currentActiveId !== activePlayerId) return;

        const currentPhase = gameState.phase;
        console.log(`Bot ${activePlayerId} is taking turn in phase ${currentPhase}`);
        addLog(`Bot ${activePlayerId} executing action in phase ${currentPhase}`, -1);
        
        const botSocket = { id: activePlayerId, emit: () => {}, broadcast: { emit: () => {} } };

        switch (currentPhase) {
          case 'action_play':
            console.log(`Bot ${activePlayerId} passes in action_play`);
            addLog(`Bot ${activePlayerId} passing action_play`, -1);
            handlers.pass_action(botSocket);
            break;

          case 'action_defend':
            console.log(`Bot ${activePlayerId} is in action_defend, checking for defense cards in play area`);
            addLog(`Bot ${activePlayerId} checking defense cards in play area`, -1);
            const hasDefenseInPlay = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
            if (hasDefenseInPlay) {
                console.log(`Bot ${activePlayerId} has defense card in play area, declaring defend`);
                handlers.declare_defend(botSocket);
            } else {
                console.log(`Bot ${activePlayerId} has no defense card in play area, passing`);
                handlers.pass_defend(botSocket);
            }
            break;

          case 'action_play_defense':
            console.log(`Bot ${activePlayerId} is in action_play_defense, checking for defense cards`);
            addLog(`Bot ${activePlayerId} checking defense cards in action_play_defense`, -1);
            const player = gameState.players[activePlayerId];
            const defenseCard = player?.hand.find(c => c.name === '防御' || c.name === '闪避');
            if (defenseCard) {
                console.log(`Bot ${activePlayerId} plays defense card: ${defenseCard.name}`);
                const isPlayer1 = gameState.seats[0] === activePlayerId;
                const x = 0; 
                const y = isPlayer1 ? 550 : -700;
                handlers.play_card(botSocket, { cardId: defenseCard.id, x, y });
            } else {
                console.log(`Bot ${activePlayerId} has no defense card, passing`);
                gameState.phase = 'action_resolve_attack';
                gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
                broadcastState();
            }
            break;

          case 'action_resolve_attack':
            console.log(`Bot ${activePlayerId} finishes resolution in ${currentPhase}`);
            handlers.end_resolve_attack(botSocket);
            break;
            
          case 'action_resolve_attack_counter':
            console.log(`Bot ${activePlayerId} finishes resolution in ${currentPhase}`);
            handlers.end_resolve_attack_counter(botSocket);
            break;
            
          case 'action_resolve_counter':
            console.log(`Bot ${activePlayerId} finishes resolution in ${currentPhase}`);
            handlers.end_resolve_counter(botSocket);
            break;

          case 'shop':
            console.log(`Bot ${activePlayerId} passes shop`);
            handlers.pass_shop(botSocket);
            break;

          case 'setup':
            if (!gameState.heroPlayed[activePlayerId]) {
              const player = gameState.players[activePlayerId];
              if (player && player.hand.length > 0) {
                const heroCards = player.hand.filter(c => c.type === 'hero');
                if (heroCards.length > 0) {
                  const heroCard = heroCards[Math.floor(Math.random() * heroCards.length)];
                  const isPlayer1 = gameState.seats[0] === activePlayerId;
                  const x = 0;
                  const y = isPlayer1 ? 550 : -700;
                  handlers.play_card(botSocket, { cardId: heroCard.id, x, y });
                }
              }
            }
            break;

          case 'supply':
          case 'end':
            handlers.proceed_phase(botSocket);
            break;

          case 'action_select_option':
            handlers.finish_resolve(botSocket);
            break;
        }
      }, 800);
    }
  };

  const handlers = {
    proceed_phase: (socket: any) => {
      gameState.lastEvolvedId = null;
      if (gameState.phase === 'supply') {
        const needsDiscard = Object.values(gameState.players).some(p => p.hand.length > 5);
        if (needsDiscard) {
          gameState.phase = 'discard';
          addLog(`进入弃牌阶段`, -1);
        } else {
          gameState.phase = 'shop';
          gameState.activePlayerIndex = 1 - gameState.firstPlayerIndex;
          addLog(`进入商店阶段`, -1);
        }
        io.emit('state_update', gameState);
        checkBotTurn();
      } else if (gameState.phase === 'end') {
        // Execute end round logic
        if (gameState.playAreaCards.length > 0) {
          gameState.discardPiles.action.push(...gameState.playAreaCards);
          gameState.playAreaCards = [];
        }
        
        const countersToRemove: string[] = [];
        gameState.counters.forEach(counter => {
          if (counter.type === 'time') {
            counter.value += 1;
            
            if (counter.boundToCardId) {
              const heroCard = gameState.tableCards.find(c => c.id === counter.boundToCardId);
              if (heroCard && heroCard.type === 'hero') {
                if (counter.value >= 2) {
                  countersToRemove.push(counter.id);
                  // Revive hero at capital
                  const token = gameState.tokens.find(t => t.boundToCardId === heroCard.id);
                  if (token) {
                    const isPlayer1 = heroCard.y > 0;
                    const castlePos = hexToPixel(0, isPlayer1 ? 4 : -4);
                    token.x = castlePos.x;
                    token.y = castlePos.y;
                    gameState.notification = (gameState.notification ? gameState.notification + ' ' : '') + `${heroCard.heroClass} 在王城复活！ (Hero revived!)`;
                  }
                }
                return;
              }
            }
            
            // Refresh monsters/chests at time = 3
            if (counter.value >= 3) {
              countersToRemove.push(counter.id);
              // Refresh logic could go here if implemented
              gameState.notification = (gameState.notification ? gameState.notification + ' ' : '') + `地图资源已刷新！ (Map resources refreshed!)`;
            }
          }
        });
        
        if (countersToRemove.length > 0) {
          gameState.counters = gameState.counters.filter(c => !countersToRemove.includes(c.id));
        }
        
        gameState.round += 1;
        gameState.phase = 'action_play';
        gameState.activePlayerIndex = gameState.firstPlayerIndex;
        gameState.consecutivePasses = 0;
        gameState.hasSeizedInitiative = false;
        
        // Reset discardFinished for next round
        Object.values(gameState.players).forEach(p => p.discardFinished = false);
        
        io.emit('state_update', gameState);
        checkBotTurn();
      }
    },

    pass_action: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_play' && playerIndex === gameState.activePlayerIndex) {
        gameState.consecutivePasses += 1;
        addLog(`玩家${playerIndex + 1}选择了Pass`, playerIndex);
        if (gameState.consecutivePasses >= 2) {
          gameState.phase = 'supply';
          gameState.consecutivePasses = 0;
          addLog(`进入补给阶段`, -1);
          
          // Execute supply logic
          const isHeroAlive = (card: TableCard) => {
            return !gameState.counters.some(c => c.type === 'time' && c.boundToCardId === card.id);
          };
          const p1Heroes = gameState.tableCards.filter(c => c.type === 'hero' && c.y > 0 && isHeroAlive(c)).length;
          const p2Heroes = gameState.tableCards.filter(c => c.type === 'hero' && c.y < 0 && isHeroAlive(c)).length;
          
          const drawCards = (playerSocketId: string, count: number) => {
            const player = gameState.players[playerSocketId];
            if (!player) return;
            for (let i = 0; i < count; i++) {
              if (gameState.decks.action.length > 0) {
                player.hand.push(gameState.decks.action.pop()!);
              } else if (gameState.discardPiles.action.length > 0) {
                gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
                gameState.discardPiles.action = [];
                if (gameState.decks.action.length > 0) {
                  player.hand.push(gameState.decks.action.pop()!);
                }
              }
            }
          };
          
          if (gameState.seats[0]) drawCards(gameState.seats[0], p1Heroes + 1);
          if (gameState.seats[1]) drawCards(gameState.seats[1], p2Heroes + 1);

          gameState.phase = 'supply';
          addLog(`进入补给阶段`, -1);
        } else {
          gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        }
        gameState.movedTokens = undefined;
        gameState.movementHistory = undefined;
        gameState.lastEvolvedId = null;
        broadcastState();
        checkBotTurn();
      }
    },
    pass_defend: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}放弃防御 (Pass Defend)`, playerIndex);
        gameState.phase = 'action_resolve_attack';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    declare_defend: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}选择防御 (Declare Defend)`, playerIndex);
        const hasDefenseCard = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
        if (hasDefenseCard) {
          gameState.phase = 'action_resolve_attack';
          gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        } else {
          gameState.phase = 'action_play_defense';
          gameState.notification = '请打出一张防御卡。 (Please play a defense card.)';
        }
        broadcastState();
        checkBotTurn();
      }
    },
    declare_counter: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_defend' && playerIndex === gameState.activePlayerIndex) {
        addLog(`玩家${playerIndex + 1}选择反击 (Declare Counter)`, playerIndex);
        const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
        const defenderCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
        const defenderToken = gameState.tokens.find(t => t.boundToCardId === gameState.selectedTargetId);
        
        if (attackerToken && defenderToken && defenderCard) {
          const attackerHex = pixelToHex(attackerToken.x, attackerToken.y);
          const defenderHex = pixelToHex(defenderToken.x, defenderToken.y);
          const dist = hexDistance(attackerHex.q, attackerHex.r, defenderHex.q, defenderHex.r);
          
          const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === defenderCard.heroClass);
          const levelData = heroData?.levels?.[defenderCard.level || 1];
          const ar = levelData?.ar || 1;
          
          if (dist > ar) {
            socket.emit('error_message', '攻击者不在反击范围内。 (Attacker is out of counter-attack range.)');
            return;
          }
        }

        const hasDefenseCard = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
        if (hasDefenseCard) {
          gameState.phase = 'action_resolve_attack_counter';
          gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        } else {
          gameState.phase = 'action_play_defense';
          gameState.notification = '请打出一张防御卡。 (Please play a defense card.)';
        }
        broadcastState();
        checkBotTurn();
      }
    },
    end_resolve_attack: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_resolve_attack' && playerIndex === gameState.activePlayerIndex) {
        // Check if attack was blocked
        const hasDefense = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
        
        if (!hasDefense && gameState.selectedTargetId) {
          // Attack succeeds
          const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
          if (targetCard) {
            const damage = gameState.selectedOption === 'heavy_strike' ? 2 : 1;
            targetCard.damage = (targetCard.damage || 0) + damage;
            let damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
            if (!damageCounter) {
               damageCounter = { id: generateId(), type: 'damage', x: targetCard.x, y: targetCard.y, value: 0, boundToCardId: targetCard.id };
               gameState.counters.push(damageCounter);
            }
            damageCounter.value = targetCard.damage;
            gameState.notification = `攻击成功！${targetCard.heroClass} 受到了 ${damage} 点伤害。 (Attack successful! ${targetCard.heroClass} took ${damage} damage.)`;
            
            // Check hero death
            const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === targetCard.heroClass);
            const levelData = heroData?.levels?.[targetCard.level || 1];
            const hp = levelData?.hp || 3;
            if (targetCard.damage >= hp) {
              // Hero dies
              targetCard.damage = 0;
              if (damageCounter) damageCounter.value = 0;
              
              // Remove token from map, place on hero card
              const token = gameState.tokens.find(t => t.boundToCardId === targetCard.id);
              if (token) {
                token.x = targetCard.x;
                token.y = targetCard.y;
              }
              
              // Add time counter to hero card
              gameState.counters.push({ id: generateId(), type: 'time', x: targetCard.x, y: targetCard.y, value: 0, boundToCardId: targetCard.id });
              
              gameState.notification += ` ${targetCard.heroClass} 阵亡！ (Hero died!)`;

              // Reward attacker
              const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
              if (attackerToken && attackerToken.boundToCardId) {
                const reward = targetCard.level || 1;
                const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === attackerToken.boundToCardId);
                if (expCounter) expCounter.value += reward;
                
                const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
                if (goldCounter) goldCounter.value += reward;
                
                gameState.notification += ` 获得 ${reward} 经验和 ${reward} 金币。 (Gained ${reward} EXP and ${reward} Gold.)`;
              }
            }
          }
        } else if (hasDefense) {
          gameState.notification = `攻击被防御！ (Attack was defended!)`;
        }
        
        // Clear play area cards (move to discard)
        gameState.playAreaCards.forEach(c => gameState.discardPiles.action.push(c));
        gameState.playAreaCards = [];
        
        gameState.phase = 'action_play';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        gameState.selectedTargetId = null;
        io.emit('state_update', gameState);
        checkBotTurn();
      }
    },
    end_resolve_attack_counter: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_resolve_attack_counter' && playerIndex === gameState.activePlayerIndex) {
        // 1. Original attack hits defender
        if (gameState.selectedTargetId) {
          const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
          if (targetCard) {
            const damage = gameState.selectedOption === 'heavy_strike' ? 2 : 1;
            targetCard.damage = (targetCard.damage || 0) + damage;
            let damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
            if (!damageCounter) {
               damageCounter = { id: generateId(), type: 'damage', x: targetCard.x, y: targetCard.y, value: 0, boundToCardId: targetCard.id };
               gameState.counters.push(damageCounter);
            }
            damageCounter.value = targetCard.damage;
            gameState.notification = `攻击成功！${targetCard.heroClass} 受到了 ${damage} 点伤害。`;
            
            // Check hero death
            const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === targetCard.heroClass);
            const levelData = heroData?.levels?.[targetCard.level || 1];
            const hp = levelData?.hp || 3;
            if (targetCard.damage >= hp) {
              targetCard.damage = 0;
              if (damageCounter) damageCounter.value = 0;
              const token = gameState.tokens.find(t => t.boundToCardId === targetCard.id);
              if (token) { token.x = targetCard.x; token.y = targetCard.y; }
              gameState.counters.push({ id: generateId(), type: 'time', x: targetCard.x, y: targetCard.y, value: 0, boundToCardId: targetCard.id });
              gameState.notification += ` ${targetCard.heroClass} 阵亡！`;

              // Reward attacker
              const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
              if (attackerToken && attackerToken.boundToCardId) {
                const reward = targetCard.level || 1;
                const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === attackerToken.boundToCardId);
                if (expCounter) expCounter.value += reward;
                
                const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
                if (goldCounter) goldCounter.value += reward;
                
                gameState.notification += ` 获得 ${reward} 经验和 ${reward} 金币。`;
              }
            }
          }
        }

        gameState.phase = 'action_resolve_counter';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        io.emit('state_update', gameState);
        checkBotTurn();
      }
    },
    end_resolve_counter: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_resolve_counter' && playerIndex === gameState.activePlayerIndex) {
        // 2. Counter-attack hits attacker
        if (gameState.selectedTokenId) {
          const attackerToken = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
          if (attackerToken && attackerToken.boundToCardId) {
            const attackerCard = gameState.tableCards.find(c => c.id === attackerToken.boundToCardId);
            if (attackerCard) {
              const counterDamage = 1;
              attackerCard.damage = (attackerCard.damage || 0) + counterDamage;
              let attackerDamageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === attackerCard.id);
              if (!attackerDamageCounter) {
                 attackerDamageCounter = { id: generateId(), type: 'damage', x: attackerCard.x, y: attackerCard.y, value: 0, boundToCardId: attackerCard.id };
                 gameState.counters.push(attackerDamageCounter);
              }
              attackerDamageCounter.value = attackerCard.damage;
              gameState.notification = `反击成功！${attackerCard.heroClass} 受到了 ${counterDamage} 点伤害。`;
              
              // Check hero death
              const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === attackerCard.heroClass);
              const levelData = heroData?.levels?.[attackerCard.level || 1];
              const hp = levelData?.hp || 3;
              if (attackerCard.damage >= hp) {
                attackerCard.damage = 0;
                if (attackerDamageCounter) attackerDamageCounter.value = 0;
                attackerToken.x = attackerCard.x;
                attackerToken.y = attackerCard.y;
                gameState.counters.push({ id: generateId(), type: 'time', x: attackerCard.x, y: attackerCard.y, value: 0, boundToCardId: attackerCard.id });
                gameState.notification += ` ${attackerCard.heroClass} 阵亡！`;

                // Reward defender (who is playerIndex)
                if (gameState.selectedTargetId) {
                  const reward = attackerCard.level || 1;
                  const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === gameState.selectedTargetId);
                  if (expCounter) expCounter.value += reward;
                  
                  const goldCounter = gameState.counters.find(c => c.type === 'gold' && (playerIndex === 0 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
                  if (goldCounter) goldCounter.value += reward;
                  
                  gameState.notification += ` 获得 ${reward} 经验和 ${reward} 金币。`;
                }
              }
            }
          }
        }

        // Clear play area cards (move to discard)
        gameState.playAreaCards.forEach(c => gameState.discardPiles.action.push(c));
        gameState.playAreaCards = [];
        
        gameState.phase = 'action_play';
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        gameState.selectedTargetId = null;
        gameState.selectedTokenId = null;
        io.emit('state_update', gameState);
        checkBotTurn();
      }
    },
    pass_shop: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'shop' && playerIndex === gameState.activePlayerIndex) {
        gameState.consecutivePasses += 1;
        if (gameState.consecutivePasses >= 2) {
          gameState.phase = 'end';
          gameState.consecutivePasses = 0;
          addLog(`进入回合结束阶段`, -1);
        } else {
          gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        }
        broadcastState();
        checkBotTurn();
      }
    },
    finish_resolve: (socket: any) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_select_option' && playerIndex === gameState.activePlayerIndex) {
        const option = gameState.selectedOption;
        
        if (option === 'seize') {
          if (playerIndex === gameState.firstPlayerIndex) {
            socket.emit('error_message', '你已经是先手玩家，无法抢先手。');
            return;
          }
          if (gameState.hasSeizedInitiative) {
            socket.emit('error_message', '本回合已经有人抢过先手了。');
            return;
          }
          gameState.firstPlayerIndex = playerIndex;
          gameState.hasSeizedInitiative = true;
        } else if (option === 'spy') {
          const opponentId = gameState.seats[1 - playerIndex];
          if (opponentId && gameState.players[opponentId]) {
            const opponent = gameState.players[opponentId];
            if (opponent.hand.length > 0) {
              const randomIndex = Math.floor(Math.random() * opponent.hand.length);
              const discardedCard = opponent.hand.splice(randomIndex, 1)[0];
              const playAreaX = 650;
              const playAreaY = 100;
              const discardOffset = gameState.playAreaCards.length * 30;
              gameState.playAreaCards.push({ ...discardedCard, x: playAreaX + discardOffset, y: playAreaY, faceUp: true });
            }
          }
        } else if (option === 'heal') {
          if (gameState.selectedTargetId) {
            const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
            if (targetCard) {
              const currentDamage = targetCard.damage || 0;
              if (currentDamage > 0) {
                targetCard.damage = currentDamage - 1;
                const damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
                if (damageCounter) damageCounter.value = targetCard.damage;
                gameState.notification = `回复成功！${targetCard.heroClass} 恢复了1点生命值。 (Heal successful! ${targetCard.heroClass} restored 1 HP.)`;
              }
            }
          }
        } else if (option === 'evolve') {
          if (gameState.selectedTargetId && heroesDatabase) {
            const targetCard = gameState.tableCards.find(c => c.id === gameState.selectedTargetId);
            if (targetCard && targetCard.heroClass && targetCard.level) {
              const nextLevel = targetCard.level + 1;
              const heroData = heroesDatabase.heroes.find((h: any) => h.name === targetCard.heroClass);
              const levelData = heroData?.levels?.[targetCard.level.toString()];
              const expNeeded = levelData?.xp;
              const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === targetCard.id);
              
              if (expCounter && expCounter.value >= expNeeded) {
                // Evolve
                targetCard.level = nextLevel;
                targetCard.frontImage = getHeroCardImage(targetCard.heroClass, nextLevel);
                targetCard.backImage = getHeroBackImage(nextLevel);
                expCounter.value -= expNeeded;
                gameState.lastEvolvedId = targetCard.id;
                
                // Heal 1 HP on evolve
                if (targetCard.damage && targetCard.damage > 0) {
                  targetCard.damage -= 1;
                  const damageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === targetCard.id);
                  if (damageCounter) damageCounter.value = targetCard.damage;
                  gameState.notification = '进化成功！英雄恢复了1点生命值。 (Evolution successful! Hero restored 1 HP.)';
                } else {
                  gameState.notification = '进化成功！ (Evolution successful!)';
                }

                // Update Token
                const token = gameState.tokens.find(t => t.image === getHeroTokenImage(targetCard.heroClass!));
                if (token) {
                  token.lv = nextLevel;
                  token.label = `${targetCard.heroClass} Lv${nextLevel}`;
                }
              }
            }
          }
        } else if (option === 'hire') {
          if (gameState.selectedTargetId) {
            const targetCard = gameState.hireAreaCards.find(c => c.id === gameState.selectedTargetId);
            if (targetCard) {
              // Deduct gold
              const goldCounter = gameState.counters.find(c => c.type === 'gold' && (isPlayer1 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
              if (goldCounter) goldCounter.value -= 2;

              // Move card to table
              const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0)));
              const heroX = -50 + (playerHeroes.length * 120);
              const heroY = isPlayer1 ? 550 : -700;
              
              const cardIndex = gameState.hireAreaCards.findIndex(c => c.id === targetCard.id);
              gameState.hireAreaCards.splice(cardIndex, 1);
              
              const tableCard: TableCard = { ...targetCard, x: heroX, y: heroY, faceUp: true };
              gameState.tableCards.push(tableCard);

              // Spawn Token
              const castlePos = hexToPixel(0, isPlayer1 ? 4 : -4);
              if (tableCard.heroClass) {
                gameState.tokens.push({
                  id: generateId(),
                  x: castlePos.x,
                  y: castlePos.y,
                  image: getHeroTokenImage(tableCard.heroClass),
                  label: `${tableCard.heroClass} Lv1`,
                  lv: 1,
                  time: 0,
                  boundToCardId: tableCard.id
                });
              }

              // Spawn counters
              gameState.counters.push({ id: generateId(), type: 'exp', x: heroX - 40, y: heroY + 80, value: 0, boundToCardId: tableCard.id });
              gameState.counters.push({ id: generateId(), type: 'damage', x: heroX + 40, y: heroY + 80, value: 0, boundToCardId: tableCard.id });
              
              alignHireArea();
              gameState.notification = `雇佣成功！${tableCard.heroClass} 加入了战场。 (Hire successful! ${tableCard.heroClass} joined the battle.)`;
            }
          }
        }

        // Recalculate healable heroes
        const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0)));
        const healableHeroIds = playerHeroes.filter(h => (h.damage || 0) > 0).map(h => h.id);
        gameState.healableHeroIds = healableHeroIds;

        gameState.phase = 'action_play';
        gameState.selectedOption = null;
        gameState.selectedTargetId = null;
        gameState.selectedTokenId = null;
        gameState.remainingMv = 0;
        gameState.reachableCells = [];
        gameState.secondaryCardId = null;
        gameState.lastPlayedCardId = null;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
    play_card: (socket: any, { cardId, x, y }) => {
      const player = gameState.players[socket.id];
      if (!player) return;
      
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const card = player.hand.splice(cardIndex, 1)[0];
        
        // Hero Play Logic
        if (card.type === 'hero' && !gameState.heroPlayed[socket.id]) {
          gameState.heroPlayed[socket.id] = true;
          
          // Move other heroes to hire area
          const otherHeroes = player.hand.filter(c => c.type === 'hero');
          player.hand = player.hand.filter(c => c.type !== 'hero');
          otherHeroes.forEach(h => {
            gameState.hireAreaCards.push({ ...h, x: 0, y: 0, faceUp: true });
          });
          alignHireArea();

          // Position played hero
          const isPlayer1 = gameState.seats[0] === socket.id;
          const heroX = -50;
          const heroY = isPlayer1 ? 550 : -700;
          
          const tableCard: TableCard = { ...card, x: heroX, y: heroY, faceUp: true };
          gameState.tableCards.push(tableCard);

          // Spawn Hero Token in Castle
          const castlePos = hexToPixel(0, isPlayer1 ? 4 : -4);
          const tokenX = castlePos.x;
          const tokenY = castlePos.y;
          if (card.heroClass) {
            const heroToken: Token = {
              id: generateId(),
              x: tokenX,
              y: tokenY,
              image: getHeroTokenImage(card.heroClass),
              label: `${card.heroClass} Lv1`,
              lv: 1,
              time: 0,
              boundToCardId: tableCard.id
            };
            gameState.tokens.push(heroToken);
          }

          // Spawn Experience and Damage tokens
          gameState.counters.push({ id: generateId(), type: 'exp', x: 0, y: heroY - 30, value: 0, boundToCardId: tableCard.id });
          gameState.counters.push({ id: generateId(), type: 'damage', x: 0, y: heroY + 180, value: 0, boundToCardId: tableCard.id });

          // Draw 4 cards from action deck
          for (let i = 0; i < 4; i++) {
            if (gameState.decks.action.length > 0) {
              player.hand.push(gameState.decks.action.pop()!);
            } else if (gameState.discardPiles.action.length > 0) {
              gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
              gameState.discardPiles.action = [];
              if (gameState.decks.action.length > 0) {
                player.hand.push(gameState.decks.action.pop()!);
              }
            }
          }

          // Check if both played
          const allPlayed = gameState.seats.filter(id => id !== null).every(id => gameState.heroPlayed[id!]);
          if (allPlayed) {
            gameState.decks.hero = [];
            gameState.phase = 'action_play';
            gameState.activePlayerIndex = gameState.firstPlayerIndex;
            gameState.consecutivePasses = 0;
            gameState.round = 1;
          } else {
            gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
          }
        } else {
          const isPlayer1 = gameState.seats[0] === socket.id;
          const isPlayer2 = gameState.seats[1] === socket.id;
          const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
          
          if (gameState.phase !== 'setup' && playerIndex !== gameState.activePlayerIndex) {
            socket.emit('error_message', '现在不是你的回合，无法打出卡牌。');
            player.hand.push(card);
            return;
          }

          if (gameState.phase === 'action_select_option' && gameState.selectedOption !== 'heavy_strike') {
            socket.emit('error_message', '请先完成当前卡牌的结算。 (Please finish resolving the current card first.)');
            player.hand.push(card);
            return;
          }

          if (gameState.phase === 'action_select_option' && gameState.selectedOption === 'heavy_strike') {
            if (gameState.secondaryCardId) {
              socket.emit('error_message', '已经打出了一张攻击卡。 (Already played an attack card.)');
              player.hand.push(card);
              return;
            }
            if (card.name === '防御' || card.name === '闪避') {
              socket.emit('error_message', '强击不能弃置防御卡。 (Heavy Strike cannot discard a defense card.)');
              player.hand.push(card);
              return;
            }
          }

          if (gameState.phase === 'action_play') {
            // Defense cards can now be played actively
          }

          if (gameState.phase === 'action_defend') {
            if (card.name !== '防御' && card.name !== '闪避') {
              socket.emit('error_message', '防御阶段只能打出防御卡。 (Only defense cards can be played during defense phase.)');
              player.hand.push(card);
              return;
            }
          }

          if (gameState.phase === 'action_play_defense' || gameState.phase === 'action_resolve_attack_counter') {
            if (card.name !== '防御') {
              socket.emit('error_message', '只能打出防御卡。 (Only defense cards can be played.)');
              player.hand.push(card);
              return;
            }
          }

          if (gameState.phase === 'action_play_counter') {
            if (card.name !== '行动' && card.name !== '强击') {
              socket.emit('error_message', '只能打出攻击卡。 (Only attack cards can be played.)');
              player.hand.push(card);
              return;
            }
          }

          if (card.type === 'action') {
            const playAreaX = 650;
            const playAreaY = 100;
            const offset = gameState.playAreaCards.length * 30;
            const tableCard: TableCard = { ...card, x: playAreaX + offset, y: playAreaY, faceUp: true };
            gameState.playAreaCards.push(tableCard);
            gameState.lastPlayedCardId = tableCard.id;
            gameState.movedTokens = undefined;
            gameState.movementHistory = undefined;
            
            if (gameState.phase === 'action_play') {
              addLog(`玩家${playerIndex + 1}打出了${card.name}`, playerIndex);
              gameState.phase = 'action_select_option';
              gameState.selectedOption = null;
              gameState.selectedTargetId = null;
              gameState.secondaryCardId = null;
              gameState.consecutivePasses = 0;
              
              // Check evolution condition
              const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0)));
              const evolvableHeroIds: string[] = [];
              for (const hero of playerHeroes) {
                const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === hero.id);
                if (expCounter && hero.heroClass && hero.level && hero.level < 3) {
                  const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === hero.heroClass);
                  const levelData = heroData?.levels?.[hero.level.toString()];
                  const expNeeded = levelData?.xp;
                  if (expNeeded !== undefined && expCounter.value >= expNeeded) {
                    evolvableHeroIds.push(hero.id);
                  }
                }
              }
              gameState.canEvolve = evolvableHeroIds.length > 0;
              gameState.evolvableHeroIds = evolvableHeroIds;

              // Check heal condition
              const healableHeroIds = playerHeroes.filter(h => (h.damage || 0) > 0).map(h => h.id);
              gameState.healableHeroIds = healableHeroIds;

              // Check hire condition
              const goldCounter = gameState.counters.find(c => c.type === 'gold' && (isPlayer1 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
              const totalHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0))).length;
              gameState.canHire = (goldCounter && goldCounter.value >= 2 && gameState.hireAreaCards.length > 0 && totalHeroes < 4);

              // Check chest condition
              const playerTokens = gameState.tokens.filter(t => {
                const c = gameState.tableCards.find(tc => tc.id === t.boundToCardId);
                return c && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0));
              });
              const onChest = playerTokens.some(t => {
                const hex = pixelToHex(t.x, t.y);
                return CHEST_HEXES.some(ch => ch.q === hex.q && ch.r === hex.r);
              });
              (gameState as any).canOpenChest = onChest;
            } else if (gameState.phase === 'action_select_option' && gameState.selectedOption === 'heavy_strike') {
              addLog(`玩家${playerIndex + 1}为强击打出了${card.name}`, playerIndex);
              gameState.secondaryCardId = tableCard.id;
            } else if (gameState.phase === 'action_defend') {
              addLog(`玩家${playerIndex + 1}打出了防御卡${card.name}`, playerIndex);
              // Stay in action_defend, UI will show Defend/Counter buttons now
            } else if (gameState.phase === 'action_play_defense') {
              addLog(`玩家${playerIndex + 1}打出了防御卡${card.name}`, playerIndex);
              gameState.phase = 'action_resolve_attack';
              gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
            } else if (gameState.phase === 'action_play_counter') {
              addLog(`玩家${playerIndex + 1}打出了反击卡${card.name}`, playerIndex);
              gameState.phase = 'action_resolve_attack_counter';
              gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
            }
          } else {
            const tableCard: TableCard = { ...card, x, y, faceUp: true };
            gameState.tableCards.push(tableCard);
            gameState.lastPlayedCardId = tableCard.id;
            gameState.movedTokens = undefined;
            gameState.movementHistory = undefined;
            
            if (gameState.phase === 'action_play') {
              gameState.phase = 'action_select_option';
              gameState.selectedOption = null;
              gameState.selectedTargetId = null;
              gameState.secondaryCardId = null;
              gameState.consecutivePasses = 0;

              // Check hire condition
              const isPlayer1 = gameState.seats[0] === socket.id;
              const isPlayer2 = gameState.seats[1] === socket.id;
              const goldCounter = gameState.counters.find(c => c.type === 'gold' && (isPlayer1 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
              const totalHeroes = gameState.tableCards.filter(c => c.type === 'hero' && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0))).length;
              gameState.canHire = (goldCounter && goldCounter.value >= 2 && gameState.hireAreaCards.length > 0 && totalHeroes < 4);
            }
          }
        }
        
        broadcastState();
        checkBotTurn();
      }
    },
    discard_card: (socket: any, cardId) => {
      const player = gameState.players[socket.id];
      if (!player) return;

      if (gameState.phase !== 'discard') {
        let cardIndex = gameState.tableCards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.tableCards.splice(cardIndex, 1)[0];
          gameState.discardPiles.action.push(card);
          io.emit('state_update', gameState);
          return;
        }
        
        cardIndex = gameState.hireAreaCards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.hireAreaCards.splice(cardIndex, 1)[0];
          gameState.discardPiles.action.push(card);
          alignHireArea();
          io.emit('state_update', gameState);
          return;
        }
        
        if (gameState.playAreaCards) {
          cardIndex = gameState.playAreaCards.findIndex(c => c.id === cardId);
          if (cardIndex !== -1) {
            const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
            gameState.discardPiles.action.push(card);
            io.emit('state_update', gameState);
            return;
          }
        }
        return;
      }

      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex !== -1 && gameState.phase === 'discard' && !player.discardFinished) {
        const card = player.hand.splice(cardIndex, 1)[0];
        gameState.discardPiles.action.push(card);
        // Save state for undo
        if (!player.discardHistory) player.discardHistory = [];
        player.discardHistory.push(card);
        io.emit('state_update', gameState);
      }
    },
    finish_discard: (socket: any) => {
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'discard' || player.discardFinished) return;

      if (player.hand.length > 5) {
        socket.emit('error_message', '手牌数量必须小于等于5张。');
        return;
      }

      player.discardFinished = true;
      player.discardHistory = []; // Clear history when finished
      
      const allFinished = gameState.seats.filter(id => id !== null).every(id => gameState.players[id!].discardFinished);
      if (allFinished) {
        gameState.phase = 'shop';
        gameState.activePlayerIndex = 1 - gameState.firstPlayerIndex;
        addLog(`进入商店阶段`, -1);
        broadcastState();
        checkBotTurn();
      } else {
        broadcastState();
        checkBotTurn(); // Trigger bots to finish their discard
      }
    },
    hire_hero: (socket: any, { cardId, goldAmount }) => {
      const player = gameState.players[socket.id];
      if (!player) return;

      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      if (!isPlayer1 && !isPlayer2) return; // Only seated players can hire

      const playerIndex = isPlayer1 ? 0 : 1;
      // Allow hire in shop phase OR action_select_option phase
      if (!['shop', 'action_select_option'].includes(gameState.phase) || playerIndex !== gameState.activePlayerIndex) {
        socket.emit('error_message', '现在不是你的雇佣时机。');
        return;
      }

      const cardIndex = gameState.hireAreaCards.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return;

      const tokenY = isPlayer1 ? 311.7 : -311.7;

      // Check if castle already has a hero token
      const castleHasHero = gameState.tokens.some(t => Math.abs(t.x) < 10 && Math.abs(t.y - tokenY) < 10);
      if (castleHasHero) {
        socket.emit('error_message', '雇佣失败：您的王城中已经有英雄了。');
        return;
      }

      // Find player's gold counter
      const goldY = isPlayer1 ? 550 : -700;
      const goldCounter = gameState.counters.find(c => c.type === 'gold' && Math.abs(c.y - goldY) < 100);
      
      if (!goldCounter || goldCounter.value < goldAmount) {
        socket.emit('error_message', '雇佣失败：金币不足。');
        return; // Not enough gold
      }

      // Deduct gold
      goldCounter.value -= goldAmount;
      addLog(`玩家${playerIndex + 1}花费${goldAmount}金币雇佣了${gameState.hireAreaCards[cardIndex].heroClass}`, playerIndex);

      // Move card to player's hero area
      const card = gameState.hireAreaCards.splice(cardIndex, 1)[0];
      alignHireArea();

      // Find how many heroes the player already has to determine x offset
      const playerHeroes = gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - goldY) < 100);
      const heroCount = playerHeroes.length;
      
      const heroX = -50 + (heroCount * 120); // Offset each new hero to the right
      const heroY = goldY;

      const tableCard: TableCard = { ...card, x: heroX, y: heroY, faceUp: true, level: 1 };
      gameState.tableCards.push(tableCard);

      // Spawn Hero Token in Castle
      const tokenX = 0; // No offset
      if (card.heroClass) {
        const heroToken: Token = {
          id: generateId(),
          x: tokenX,
          y: tokenY,
          image: getHeroTokenImage(card.heroClass),
          label: `${card.heroClass} Lv1`,
          lv: 1,
          time: 0,
          boundToCardId: tableCard.id
        };
        gameState.tokens.push(heroToken);
      }

      // Spawn Experience and Damage tokens
      gameState.counters.push({ id: generateId(), type: 'exp', x: heroX, y: heroY + 80, value: Math.max(0, goldAmount - 2), boundToCardId: tableCard.id });
      gameState.counters.push({ id: generateId(), type: 'damage', x: heroX + 80, y: heroY + 80, value: 0, boundToCardId: tableCard.id });

      // If hired during action phase, finish resolve
      if (gameState.phase === 'action_select_option') {
        gameState.phase = 'action_play';
        gameState.selectedOption = null;
        gameState.selectedTargetId = null;
        gameState.secondaryCardId = null;
        gameState.lastPlayedCardId = null;
        gameState.selectedTokenId = null;
        gameState.remainingMv = 0;
        gameState.reachableCells = [];
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      } else {
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    },
  };

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    const playerCount = Object.keys(gameState.players).length;

    gameState.players[socket.id] = {
      id: socket.id,
      name: `Player ${playerCount + 1}`,
      hand: [],
      discardFinished: false
    };
    gameState.heroPlayed[socket.id] = false;

    socket.emit('init', gameState);
    socket.broadcast.emit('state_update', gameState);

    socket.on('start_game', () => {
      if (gameState.gameStarted) return;
      
      const occupiedSeats = gameState.seats.filter(id => id !== null) as string[];
      if (occupiedSeats.length === 0) return;

      gameState.gameStarted = true;
      
      // AI Substitute for Player 2 if only one player is present
      if (occupiedSeats.length === 1) {
        const emptySeatIndex = gameState.seats.indexOf(null);
        if (emptySeatIndex !== -1 && emptySeatIndex < 2) {
          const botId = `bot_player_${emptySeatIndex + 1}`;
          gameState.seats[emptySeatIndex] = botId;
          gameState.players[botId] = {
            id: botId,
            name: 'Computer (AI)',
            hand: [],
            isBot: true
          };
          gameState.heroPlayed[botId] = false;
        }
      }

      const activeSeats = gameState.seats.filter(id => id !== null) as string[];
      activeSeats.forEach(id => {
        for (let i = 0; i < 4; i++) {
          if (gameState.decks.hero.length > 0) {
            gameState.players[id].hand.push(gameState.decks.hero.pop()!);
          }
        }
      });
      
      broadcastState();
      checkBotTurn();
    });

    socket.on('sit_down', ({ seatIndex, playerName }: { seatIndex: number, playerName: string }) => {
      if (!gameState.gameStarted && gameState.seats[seatIndex] === null) {
        const existingIndex = gameState.seats.indexOf(socket.id);
        if (existingIndex !== -1) {
          gameState.seats[existingIndex] = null;
        }
        gameState.seats[seatIndex] = socket.id;
        
        if (gameState.players[socket.id]) {
          gameState.players[socket.id].name = playerName;
        }
        
        io.emit('state_update', gameState);
      } else if (gameState.gameStarted && gameState.seats[seatIndex] === null) {
        // Reconnect logic
        const oldPlayerId = Object.keys(gameState.players).find(id => gameState.players[id].name === playerName);
        if (oldPlayerId) {
          // Transfer data to new socket id
          gameState.players[socket.id] = { ...gameState.players[oldPlayerId], id: socket.id };
          if (gameState.heroPlayed[oldPlayerId] !== undefined) {
             gameState.heroPlayed[socket.id] = gameState.heroPlayed[oldPlayerId];
          }
          gameState.seats[seatIndex] = socket.id;
          
          // Update active player index if needed
          if (gameState.seats[gameState.activePlayerIndex] === oldPlayerId) {
            // No need to change index, just the seat mapping is updated
          }
          
          io.emit('state_update', gameState);
        }
      }
    });

    socket.on('leave_seat', () => {
      if (!gameState.gameStarted) {
        const existingIndex = gameState.seats.indexOf(socket.id);
        if (existingIndex !== -1) {
          gameState.seats[existingIndex] = null;
          io.emit('state_update', gameState);
        }
      }
    });

    socket.on('update_image_config', (config: ImageConfig) => {
      gameState = createInitialState();
      io.emit('init', gameState);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      const existingIndex = gameState.seats.indexOf(socket.id);
      if (existingIndex !== -1) {
        gameState.seats[existingIndex] = null;
      }
      // Do not delete player data to allow reconnection by name
      io.emit('state_update', gameState);
    });

    socket.on('move_item', ({ type, id, x, y }) => {
      let item;
      if (type === 'token') item = gameState.tokens.find(t => t.id === id);
      if (type === 'card') {
        item = gameState.tableCards.find(c => c.id === id);
        if (!item) item = gameState.hireAreaCards.find(c => c.id === id);
        if (!item && gameState.playAreaCards) item = gameState.playAreaCards.find(c => c.id === id);
      }
      if (type === 'counter') item = gameState.counters.find(c => c.id === id);

      if (item) {
        // Exclusion Zone: x > 800, y > 400 (approx)
        if (x > 800 && y > 400) {
          if (type === 'token') gameState.tokens = gameState.tokens.filter(t => t.id !== id);
          if (type === 'card') {
            gameState.tableCards = gameState.tableCards.filter(c => c.id !== id);
            gameState.hireAreaCards = gameState.hireAreaCards.filter(c => c.id !== id);
            if (gameState.playAreaCards) gameState.playAreaCards = gameState.playAreaCards.filter(c => c.id !== id);
          }
          if (type === 'counter') gameState.counters = gameState.counters.filter(c => c.id !== id);
          io.emit('state_update', gameState);
          return;
        }

        // Hire Area Zone: x > 100, y < -300
        if (type === 'card' && x > 100 && y < -350) {
          const cardIndex = gameState.tableCards.findIndex(c => c.id === id);
          if (cardIndex !== -1) {
            const card = gameState.tableCards.splice(cardIndex, 1)[0];
            gameState.hireAreaCards.push(card);
            alignHireArea();
            io.emit('state_update', gameState);
            return;
          }
        }

        if (type === 'card' && gameState.phase === 'discard') {
          socket.emit('error_message', '弃牌阶段无法移动卡牌。');
          return;
        }

        const dx = x - item.x;
        const dy = y - item.y;
        item.x = x;
        item.y = y;
        socket.broadcast.emit('item_moved', { type, id, x, y });

        if (type === 'card') {
          gameState.counters.filter(c => c.boundToCardId === id).forEach(c => {
            c.x += dx;
            c.y += dy;
            io.emit('item_moved', { type: 'counter', id: c.id, x: c.x, y: c.y });
          });
          gameState.tokens.filter(t => t.boundToCardId === id).forEach(t => {
            t.x += dx;
            t.y += dy;
            io.emit('item_moved', { type: 'token', id: t.id, x: t.x, y: t.y });
          });
        }
      }
    });

    socket.on('draw_card', (deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action') => {
      let deck;
      if (deckType === 'discard_action') {
        deck = gameState.discardPiles.action;
      } else {
        deck = gameState.decks[deckType];
      }

      if (deck && deck.length > 0) {
        const card = deck.pop()!;
        const player = gameState.players[socket.id];
        if (player) {
          player.hand.push(card);
          io.emit('state_update', gameState);
        }
      } else if (deckType === 'action' && gameState.discardPiles.action.length > 0) {
        gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
        gameState.discardPiles.action = [];
        const card = gameState.decks.action.pop()!;
        const player = gameState.players[socket.id];
        if (player) {
          player.hand.push(card);
          io.emit('state_update', gameState);
        }
      }
    });

    socket.on('draw_card_to_table', (deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action', x: number, y: number) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (deckType.startsWith('treasure') && (gameState.phase !== 'shop' || playerIndex !== gameState.activePlayerIndex)) {
        socket.emit('error_message', '现在不是你的商店阶段，无法购买装备。');
        return;
      }

      let deck;
      if (deckType === 'discard_action') {
        deck = gameState.discardPiles.action;
      } else {
        deck = gameState.decks[deckType];
      }

      if (deck && deck.length > 0) {
        const card = deck.pop()!;
        gameState.tableCards.push({
          ...card,
          x,
          y,
          faceUp: true
        });
        io.emit('state_update', gameState);
      } else if (deckType === 'action' && gameState.discardPiles.action.length > 0) {
        gameState.decks.action = [...gameState.discardPiles.action].sort(() => Math.random() - 0.5);
        gameState.discardPiles.action = [];
        const card = gameState.decks.action.pop()!;
        gameState.tableCards.push({
          ...card,
          x,
          y,
          faceUp: true
        });
        io.emit('state_update', gameState);
      }
    });

    socket.on('shuffle_deck', (deckType: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero' | 'discard_action') => {
      let deck;
      if (deckType === 'discard_action') {
        deck = gameState.discardPiles.action;
      } else {
        deck = gameState.decks[deckType];
      }
      if (deck) {
        deck.sort(() => Math.random() - 0.5);
        io.emit('state_update', gameState);
      }
    });

    socket.on('take_card_to_hand', (cardId) => {
      const player = gameState.players[socket.id];
      if (!player) return;

      let cardIndex = gameState.tableCards.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const card = gameState.tableCards.splice(cardIndex, 1)[0];
        player.hand.push(card);
        io.emit('state_update', gameState);
        return;
      }
      cardIndex = gameState.hireAreaCards.findIndex(c => c.id === cardId);
      if (cardIndex !== -1) {
        const card = gameState.hireAreaCards.splice(cardIndex, 1)[0];
        player.hand.push(card);
        alignHireArea();
        io.emit('state_update', gameState);
        return;
      }
      if (gameState.playAreaCards) {
        cardIndex = gameState.playAreaCards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          player.hand.push(card);
          io.emit('state_update', gameState);
          return;
        }
      }
    });

    socket.on('play_card', ({ cardId, x, y }) => handlers.play_card(socket, { cardId, x, y }));

    socket.on('undo_play', () => {
      const player = gameState.players[socket.id];
      if (!player) return;
      
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if ((gameState.phase === 'action_select_option' || gameState.phase === 'action_defend') && playerIndex === gameState.activePlayerIndex) {
        if (gameState.secondaryCardId) {
          // Undo secondary card play
          let cardIndex = gameState.playAreaCards.findIndex(c => c.id === gameState.secondaryCardId);
          let card;
          if (cardIndex !== -1) {
            card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          } else {
            cardIndex = gameState.tableCards.findIndex(c => c.id === gameState.secondaryCardId);
            if (cardIndex !== -1) {
              card = gameState.tableCards.splice(cardIndex, 1)[0];
            }
          }
          if (card) {
            player.hand.push({
              id: card.id,
              frontImage: card.frontImage,
              backImage: card.backImage,
              type: card.type,
              name: card.name,
              heroClass: card.heroClass,
              level: card.level
            });
            gameState.secondaryCardId = null;
            broadcastState();
          }
        } else if (gameState.selectedTargetId) {
          gameState.selectedTargetId = null;
          broadcastState();
        } else if (gameState.movementHistory && gameState.movementHistory.length > 0) {
          // Granular movement undo
          const lastStep = gameState.movementHistory.pop()!;
          const token = gameState.tokens.find(t => t.id === lastStep.tokenId);
          if (token) {
            token.x = lastStep.fromX;
            token.y = lastStep.fromY;
            gameState.remainingMv! += lastStep.mvCost;
            
            // Re-calculate reachable cells from new (old) position
            const hex = pixelToHex(token.x, token.y);
            gameState.reachableCells = calculateReachableCells(hex.q, hex.r, gameState.remainingMv!, playerIndex);
          }
          broadcastState();
        } else if (gameState.selectedTokenId) {
          // Deselect token
          gameState.selectedTokenId = null;
          gameState.remainingMv = 0;
          gameState.reachableCells = [];
          broadcastState();
        } else if (gameState.selectedOption) {
          // Deselect option
          gameState.selectedOption = null;
          gameState.selectedTokenId = null;
          gameState.remainingMv = 0;
          gameState.reachableCells = [];
          gameState.movementHistory = undefined;
          broadcastState();
        } else if (gameState.lastPlayedCardId) {
          // Undo primary card play
          let cardIndex = gameState.playAreaCards.findIndex(c => c.id === gameState.lastPlayedCardId);
          let card;
          
          if (cardIndex !== -1) {
            card = gameState.playAreaCards.splice(cardIndex, 1)[0];
          } else {
            cardIndex = gameState.tableCards.findIndex(c => c.id === gameState.lastPlayedCardId);
            if (cardIndex !== -1) {
              card = gameState.tableCards.splice(cardIndex, 1)[0];
            }
          }

          if (card) {
            // Revert token positions if any moved
            if (gameState.movedTokens) {
              Object.entries(gameState.movedTokens).forEach(([tokenId, pos]) => {
                const token = gameState.tokens.find(t => t.id === tokenId);
                if (token) {
                  token.x = pos.x;
                  token.y = pos.y;
                }
              });
              gameState.movedTokens = undefined;
            }

            // If it was a hero, remove the token and counters too
            if (card.type === 'hero') {
              gameState.tokens = gameState.tokens.filter(t => t.boundToCardId !== card.id);
              gameState.counters = gameState.counters.filter(c => c.boundToCardId !== card.id);
              gameState.heroPlayed[socket.id] = false;
            }

            player.hand.push({
              id: card.id,
              frontImage: card.frontImage,
              backImage: card.backImage,
              type: card.type,
              name: card.name,
              heroClass: card.heroClass,
              level: card.level
            });
            if (gameState.phase !== 'action_defend') {
              gameState.phase = 'action_play';
            }
            gameState.lastPlayedCardId = null;
            gameState.selectedOption = null;
            gameState.selectedTokenId = null;
            gameState.remainingMv = 0;
            gameState.reachableCells = [];
            broadcastState();
          }
        }
      }
    });

    socket.on('select_option', (option: string) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if ((gameState.phase === 'action_select_option' || gameState.phase === 'shop') && playerIndex === gameState.activePlayerIndex) {
        if (option === 'heal' && (!gameState.healableHeroIds || gameState.healableHeroIds.length === 0)) {
          socket.emit('error_message', '没有可以回复的英雄。 (No heroes available to heal.)');
          return;
        }
        if (option === 'evolve' && (!gameState.evolvableHeroIds || gameState.evolvableHeroIds.length === 0)) {
          socket.emit('error_message', '没有可以进化的英雄。 (No heroes available to evolve.)');
          return;
        }
        if (option === 'hire') {
          const isPlayer1 = gameState.seats[0] === socket.id;
          const castlePos = hexToPixel(0, isPlayer1 ? 4 : -4);
          const castleHasHero = gameState.tokens.some(t => Math.abs(t.x - castlePos.x) < 10 && Math.abs(t.y - castlePos.y) < 10);
          if (castleHasHero) {
            socket.emit('error_message', '王城中已有英雄，无法雇佣。 (Castle is occupied, cannot hire.)');
            return;
          }
        }
        gameState.selectedOption = option;
        console.log(`Player ${playerIndex + 1} selected option: ${option}, phase: ${gameState.phase}, activePlayer: ${gameState.activePlayerIndex}`);
        gameState.selectedTokenId = null;
        gameState.remainingMv = 0;
        gameState.reachableCells = [];
        gameState.movementHistory = undefined;
        broadcastState();
      }
    });

    socket.on('select_token', (tokenId: string) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_select_option' && playerIndex === gameState.activePlayerIndex) {
        console.log(`Player ${playerIndex + 1} selecting token: ${tokenId}, option: ${gameState.selectedOption}`);
        if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
          const token = gameState.tokens.find(t => t.id === tokenId);
          if (token && token.boundToCardId) {
            const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
            if (card && ((isPlayer1 && card.y > 0) || (isPlayer2 && card.y < 0))) {
              gameState.selectedTokenId = tokenId;
              
              // Record original position for undo if not already recorded
              if (!gameState.movedTokens) gameState.movedTokens = {};
              if (!gameState.movedTokens[tokenId]) {
                gameState.movedTokens[tokenId] = { x: token.x, y: token.y };
              }
              
              // Calculate MV
              const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
              const levelData = heroData?.levels?.[card.level || 1];
              let mv = levelData?.mv || 1;
              if (gameState.selectedOption === 'sprint') mv += 1;
              
              gameState.remainingMv = mv;
              const hex = pixelToHex(token.x, token.y);
              gameState.reachableCells = calculateReachableCells(hex.q, hex.r, mv, playerIndex);
              broadcastState();
            }
          }
        } else if (gameState.selectedOption === 'attack' || (gameState.selectedOption === 'heavy_strike' && gameState.secondaryCardId)) {
          const token = gameState.tokens.find(t => t.id === tokenId);
          if (token && token.boundToCardId) {
            const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
            if (card && ((isPlayer1 && card.y > 0) || (isPlayer2 && card.y < 0))) {
              gameState.selectedTokenId = tokenId;
              
              // Calculate AR
              const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
              const levelData = heroData?.levels?.[card.level || 1];
              let ar = levelData?.ar || 1;
              
              const hex = pixelToHex(token.x, token.y);
              gameState.reachableCells = calculateAttackableCells(hex.q, hex.r, ar, playerIndex);
              
              if (gameState.reachableCells.length === 0) {
                socket.emit('error_message', '攻击范围内没有可以攻击的对象。 (No targets in attack range.)');
                gameState.selectedTokenId = null;
              }
              broadcastState();
            }
          }
        } else if (gameState.selectedOption === 'heavy_strike' && !gameState.secondaryCardId) {
          socket.emit('error_message', '请先打出一张行动卡作为攻击卡。 (Please play an action card as attack first.)');
        }
      }
    });

    socket.on('move_token_to_cell', ({ q, r }) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_select_option' && playerIndex === gameState.activePlayerIndex && gameState.selectedTokenId) {
        const token = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
        if (token && gameState.reachableCells.some(c => c.q === q && c.r === r)) {
          if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
            const currentHex = pixelToHex(token.x, token.y);
            
            // Calculate path distance (BFS again to find shortest path in reachable set)
            const getPathDist = (start: {q:number, r:number}, end: {q:number, r:number}) => {
              const queue = [{ q: start.q, r: start.r, dist: 0 }];
              const visited = new Set<string>();
              visited.add(`${start.q},${start.r}`);
              while (queue.length > 0) {
                const { q: cq, r: cr, dist } = queue.shift()!;
                if (cq === end.q && cr === end.r) return dist;
                for (const n of getNeighbors(cq, cr)) {
                  const key = `${n.q},${n.r}`;
                  if (!visited.has(key) && gameState.reachableCells.some(rc => rc.q === n.q && rc.r === n.r) || (n.q === end.q && n.r === end.r)) {
                    visited.add(key);
                    queue.push({ ...n, dist: dist + 1 });
                  }
                }
              }
              return Math.max(Math.abs(start.q - end.q), Math.abs(start.r - end.r), Math.abs((-start.q - start.r) - (-end.q - end.r)));
            };

            const dist = getPathDist(currentHex, {q, r});
            
            if (dist <= gameState.remainingMv!) {
              // Record step for granular undo
              if (!gameState.movementHistory) gameState.movementHistory = [];
              gameState.movementHistory.push({
                tokenId: token.id,
                fromX: token.x,
                fromY: token.y,
                mvCost: dist
              });

              const pos = hexToPixel(q, r);
              token.x = pos.x;
              token.y = pos.y;
              gameState.remainingMv! -= dist;

              if (gameState.remainingMv! > 0) {
                gameState.reachableCells = calculateReachableCells(q, r, gameState.remainingMv!, playerIndex);
              } else {
                gameState.reachableCells = [];
              }
              broadcastState();
            }
          } else if (gameState.selectedOption === 'attack' || (gameState.selectedOption === 'heavy_strike' && gameState.secondaryCardId)) {
            // Handle attack on hex
            const monster = MONSTER_HEXES.find(m => m.q === q && m.r === r);
            if (monster) {
              const pos = hexToPixel(q, r);
              const hasTimer = gameState.counters.some(c => c.type === 'time' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
              if (!hasTimer) {
                // Attack monster
                let damageCounter = gameState.counters.find(c => c.type === 'damage' && Math.abs(c.x - pos.x) < 10 && Math.abs(c.y - pos.y) < 10);
                if (!damageCounter) {
                  damageCounter = { id: generateId(), type: 'damage', x: pos.x, y: pos.y, value: 0 };
                  gameState.counters.push(damageCounter);
                }
                
                const damage = gameState.selectedOption === 'heavy_strike' ? 2 : 1; // Base damage
                damageCounter.value += damage;
                
                if (damageCounter.value >= monster.level) {
                  // Monster dies
                  gameState.counters = gameState.counters.filter(c => c.id !== damageCounter!.id);
                  gameState.counters.push({ id: generateId(), type: 'time', x: pos.x, y: pos.y, value: 0 });
                  
                  // Gain EXP and Gold
                  const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === token.boundToCardId);
                  if (expCounter) expCounter.value += monster.level;
                  
                  const goldCounter = gameState.counters.find(c => c.type === 'gold' && (isPlayer1 ? (c.x === -150 && c.y === 550) : (c.x === -150 && c.y === -700)));
                  if (goldCounter) goldCounter.value += monster.level;
                  
                  gameState.notification = `击杀怪物！获得 ${monster.level} 经验和 ${monster.level} 金币。 (Monster killed! Gained ${monster.level} EXP and ${monster.level} Gold.)`;
                } else {
                  // Monster counter-attacks
                  const heroCard = gameState.tableCards.find(c => c.id === token.boundToCardId);
                  if (heroCard) {
                    heroCard.damage = (heroCard.damage || 0) + 1;
                    const heroDamageCounter = gameState.counters.find(c => c.type === 'damage' && c.boundToCardId === heroCard.id);
                    if (heroDamageCounter) heroDamageCounter.value = heroCard.damage;
                    gameState.notification = `攻击怪物！怪物反击造成 1 点伤害。 (Attacked monster! Monster counter-attacked for 1 damage.)`;
                    
                    // Check hero death
                    const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === heroCard.heroClass);
                    const levelData = heroData?.levels?.[heroCard.level || 1];
                    const hp = levelData?.hp || 3;
                    if (heroCard.damage >= hp) {
                      // Hero dies
                      heroCard.damage = 0;
                      if (heroDamageCounter) heroDamageCounter.value = 0;
                      
                      // Remove token from map, place on hero card
                      token.x = heroCard.x;
                      token.y = heroCard.y;
                      
                      // Add time counter to hero card
                      gameState.counters.push({ id: generateId(), type: 'time', x: heroCard.x, y: heroCard.y, value: 0, boundToCardId: heroCard.id });
                      
                      gameState.notification += ` ${heroCard.heroClass} 阵亡！ (Hero died!)`;
                    }
                  }
                }
                
                // Finish attack action
                gameState.phase = 'action_play';
                gameState.selectedOption = null;
                gameState.selectedTargetId = null;
                gameState.selectedTokenId = null;
                gameState.reachableCells = [];
                gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
                addLog(`玩家${playerIndex + 1}攻击了怪物并结束回合`, playerIndex);
                broadcastState();
                checkBotTurn();
                return;
              }
            }
            
            // Attack enemy castle
            const enemyCastleQ = 0;
            const enemyCastleR = playerIndex === 0 ? -4 : 4;
            if (q === enemyCastleQ && r === enemyCastleR) {
              const enemyUnit = gameState.tokens.find(t => {
                const hex = pixelToHex(t.x, t.y);
                return hex.q === q && hex.r === r;
              });
              if (!enemyUnit) {
                const enemyIndex = 1 - playerIndex;
                gameState.castleHP[enemyIndex] = (gameState.castleHP[enemyIndex] || 3) - 1;
                gameState.notification = `王城受到攻击！玩家 ${enemyIndex + 1} 的王城 HP 剩余 ${gameState.castleHP[enemyIndex]}。`;
                
                if (gameState.castleHP[enemyIndex] <= 0) {
                  gameState.notification = `游戏结束！玩家 ${playerIndex + 1} 摧毁了敌方王城，获得胜利！`;
                  gameState.gameStarted = false;
                }
                
                gameState.phase = 'action_play';
                gameState.selectedOption = null;
                gameState.selectedTargetId = null;
                gameState.selectedTokenId = null;
                gameState.reachableCells = [];
                gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
                broadcastState();
                checkBotTurn();
                return;
              }
            }

            // Attack enemy hero
            const enemyTokens = gameState.tokens.filter(t => {
               const card = gameState.tableCards.find(c => c.id === t.boundToCardId);
               if (!card) return false;
               const isEnemy = playerIndex === 0 ? card.y < 0 : card.y > 0;
               if (!isEnemy) return false;
               const hex = pixelToHex(t.x, t.y);
               return hex.q === q && hex.r === r;
            });
            
            if (enemyTokens.length > 0) {
              const targetToken = enemyTokens[0];
              gameState.selectedTargetId = targetToken.boundToCardId || null;
              gameState.phase = 'action_defend';
              gameState.lastPlayedCardId = null;
              gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
              gameState.reachableCells = [];
              broadcastState();
              checkBotTurn();
            }
          }
        }
      }
    });

    socket.on('steal_first_player', () => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (playerIndex !== -1 && playerIndex !== gameState.firstPlayerIndex) {
        gameState.firstPlayerIndex = playerIndex;
        io.emit('state_update', gameState);
      }
    });

    socket.on('pass_action', () => handlers.pass_action(socket));

    socket.on('select_target', (targetId: string) => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'action_select_option' && playerIndex === gameState.activePlayerIndex) {
        gameState.selectedTargetId = targetId;
        io.emit('state_update', gameState);
      }
    });

    socket.on('finish_resolve', () => handlers.finish_resolve(socket));

    socket.on('clear_notification', () => {
      gameState.notification = null;
      broadcastState();
    });

    socket.on('declare_defend', () => handlers.declare_defend(socket));

    socket.on('declare_counter', () => handlers.declare_counter(socket));

    socket.on('cancel_defend_or_counter', () => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if ((gameState.phase === 'action_play_defense' || gameState.phase === 'action_play_counter') && playerIndex === gameState.activePlayerIndex) {
        gameState.phase = 'action_defend';
        gameState.notification = null;
        broadcastState();
        checkBotTurn();
      }
    });

    socket.on('pass_defend', () => handlers.pass_defend(socket));

    socket.on('end_resolve_attack', () => handlers.end_resolve_attack(socket));

    socket.on('end_resolve_attack_counter', () => handlers.end_resolve_attack_counter(socket));

    socket.on('end_resolve_counter', () => handlers.end_resolve_counter(socket));

    socket.on('next_shop', () => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      
      if (gameState.phase === 'shop' && playerIndex === gameState.activePlayerIndex) {
        gameState.consecutivePasses = 0;
        gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
        broadcastState();
        checkBotTurn();
      }
    });

    socket.on('pass_shop', () => handlers.pass_shop(socket));

    socket.on('proceed_phase', () => handlers.proceed_phase(socket));

    socket.on('end_turn', () => {
      let stateChanged = false;
      if (gameState.playAreaCards.length > 0) {
        gameState.discardPiles.action.push(...gameState.playAreaCards);
        gameState.playAreaCards = [];
        stateChanged = true;
      }
      
      const countersToRemove: string[] = [];
      gameState.counters.forEach(counter => {
        if (counter.type === 'time') {
          counter.value += 1;
          if (counter.value >= 4) {
            countersToRemove.push(counter.id);
          }
          stateChanged = true;
        }
      });
      
      if (countersToRemove.length > 0) {
        gameState.counters = gameState.counters.filter(c => !countersToRemove.includes(c.id));
      }
      
      if (stateChanged) {
        io.emit('state_update', gameState);
      }
    });

    socket.on('open_chest', () => {
      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
      const player = gameState.players[socket.id];

      if (gameState.phase === 'action_select_option' && playerIndex === gameState.activePlayerIndex && (gameState as any).canOpenChest) {
        // Find the hero on the chest
        const playerTokens = gameState.tokens.filter(t => {
          const c = gameState.tableCards.find(tc => tc.id === t.boundToCardId);
          return c && ((isPlayer1 && c.y > 0) || (isPlayer2 && c.y < 0));
        });
        const tokenOnChest = playerTokens.find(t => {
          const hex = pixelToHex(t.x, t.y);
          return CHEST_HEXES.some(ch => ch.q === hex.q && ch.r === hex.r);
        });

        if (tokenOnChest) {
          const hex = pixelToHex(tokenOnChest.x, tokenOnChest.y);
          // For now, let's just give a T1 card
          if (gameState.decks.treasure1.length > 0) {
            const card = gameState.decks.treasure1.pop()!;
            player.hand.push(card);
            addLog(`玩家${playerIndex + 1}开启了宝箱并获得了宝藏`, playerIndex);
            
            // Add time counter to the chest hex to "deplete" it
            gameState.counters.push({ id: generateId(), type: 'time', x: tokenOnChest.x, y: tokenOnChest.y, value: 0 });
          }
          
          // Finish action
          gameState.phase = 'action_play';
          gameState.selectedOption = null;
          gameState.selectedTargetId = null;
          gameState.selectedTokenId = null;
          gameState.activePlayerIndex = 1 - gameState.activePlayerIndex;
          broadcastState();
          checkBotTurn();
        }
      }
    });

    socket.on('hire_hero', ({ cardId, goldAmount }) => handlers.hire_hero(socket, { cardId, goldAmount }));

    socket.on('evolve_hero', (cardId) => {
      const card = gameState.tableCards.find(c => c.id === cardId);
      if (card && card.type === 'hero' && card.heroClass && card.level && card.level < 3) {
        const expCounter = gameState.counters.find(c => c.type === 'exp' && c.boundToCardId === card.id);
        const heroData = heroesDatabase?.heroes?.find((h: any) => h.name === card.heroClass);
        const levelData = heroData?.levels?.[card.level.toString()];
        const expNeeded = levelData?.xp;

        if (expCounter && expNeeded !== undefined && expCounter.value >= expNeeded) {
          expCounter.value -= expNeeded;
          card.level += 1;
          card.frontImage = getHeroCardImage(card.heroClass, card.level);
          card.backImage = getHeroBackImage(card.level);
          
          // Also update the token level
          const token = gameState.tokens.find(t => t.boundToCardId === card.id);
          if (token) {
            token.lv = card.level;
            token.label = `${card.heroClass} Lv${card.level}`;
          }
          
          addLog(`玩家${gameState.activePlayerIndex + 1}进化了${card.heroClass}到Lv${card.level}`, gameState.activePlayerIndex);
          gameState.lastEvolvedId = card.id;
          broadcastState();
          
          // Clear effect after a short delay
          setTimeout(() => {
            if (gameState.lastEvolvedId === card.id) {
              gameState.lastEvolvedId = null;
              broadcastState();
            }
          }, 2000);
        }
      }
    });

    socket.on('discard_card', (cardId) => handlers.discard_card(socket, cardId));

    socket.on('undo_discard', () => {
      const player = gameState.players[socket.id];
      if (!player || gameState.phase !== 'discard' || player.discardFinished || !player.discardHistory || player.discardHistory.length === 0) return;

      const card = player.discardHistory.pop();
      if (card) {
        player.hand.push(card);
        const discardIndex = gameState.discardPiles.action.findIndex(c => c.id === card.id);
        if (discardIndex !== -1) gameState.discardPiles.action.splice(discardIndex, 1);
        io.emit('state_update', gameState);
      }
    });

    socket.on('finish_discard', () => handlers.finish_discard(socket));

    socket.on('flip_card', (cardId) => {
      let card = gameState.tableCards.find(c => c.id === cardId);
      if (!card) card = gameState.hireAreaCards.find(c => c.id === cardId);
      if (!card && gameState.playAreaCards) card = gameState.playAreaCards.find(c => c.id === cardId);
      
      if (card) {
        card.faceUp = !card.faceUp;
        io.emit('card_flipped', { id: cardId, faceUp: card.faceUp });
      }
    });

    socket.on('add_counter', ({ type, x, y, value }) => {
      const counter: Counter = { id: generateId(), type, x, y, value: value ?? 0 };
      gameState.counters.push(counter);
      io.emit('state_update', gameState);
    });

    socket.on('update_counter', ({ id, delta }) => {
      const counterIndex = gameState.counters.findIndex(c => c.id === id);
      if (counterIndex !== -1) {
        const counter = gameState.counters[counterIndex];
        counter.value += delta;
        
        // Sync damage counter to TableCard
        if (counter.type === 'damage' && counter.boundToCardId) {
          const card = gameState.tableCards.find(c => c.id === counter.boundToCardId);
          if (card) {
            card.damage = counter.value;
          }
        }

        if (counter.type === 'time' && counter.value >= 4) {
          gameState.counters.splice(counterIndex, 1);
          io.emit('state_update', gameState);
        } else {
          io.emit('counter_updated', { id, value: counter.value });
        }
      }
    });

    socket.on('update_token_value', ({ id, field, delta }) => {
      const token = gameState.tokens.find(t => t.id === id);
      if (token && (field === 'lv' || field === 'time')) {
        token[field] += delta;
        io.emit('state_update', gameState);
      }
    });

    socket.on('spawn_hero', ({ heroClass, level, x, y }) => {
      if (level === 1) {
        const token: Token = {
          id: generateId(),
          x, y,
          image: getHeroTokenImage(heroClass),
          label: `${heroClass} Lv1`,
          lv: 1,
          time: 0
        };
        gameState.tokens.push(token);
      } else {
        const card: TableCard = {
          id: generateId(),
          x, y,
          frontImage: getHeroCardImage(heroClass, level),
          backImage: getHeroBackImage(level),
          type: 'hero',
          faceUp: true
        };
        gameState.tableCards.push(card);
      }
      io.emit('state_update', gameState);
    });
    
    socket.on('reset_game', () => {
      const currentPlayers = { ...gameState.players };
      Object.values(currentPlayers).forEach(p => p.hand = []);
      
      gameState = createInitialState();
      gameState.players = currentPlayers;
      io.emit('init', gameState);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
