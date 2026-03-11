import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import type { GameState, Card, TableCard, Token, Counter, Player, ImageConfig } from './src/types.ts';

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

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    const playerCount = Object.keys(gameState.players).length;

    gameState.players[socket.id] = {
      id: socket.id,
      name: `Player ${playerCount + 1}`,
      hand: [],
    };
    gameState.heroPlayed[socket.id] = false;

    socket.emit('init', gameState);
    socket.broadcast.emit('state_update', gameState);

    socket.on('start_game', () => {
      if (gameState.gameStarted) return;
      gameState.gameStarted = true;
      
      const occupiedSeats = gameState.seats.filter(id => id !== null) as string[];
      
      if (occupiedSeats.length >= 2) {
        const playerIds = occupiedSeats.slice(0, 2);
        playerIds.forEach(id => {
          for (let i = 0; i < 4; i++) {
            if (gameState.decks.hero.length > 0) {
              gameState.players[id].hand.push(gameState.decks.hero.pop()!);
            }
          }
        });
      }
      
      io.emit('state_update', gameState);
    });

    socket.on('sit_down', (seatIndex: number) => {
      if (!gameState.gameStarted && gameState.seats[seatIndex] === null) {
        const existingIndex = gameState.seats.indexOf(socket.id);
        if (existingIndex !== -1) {
          gameState.seats[existingIndex] = null;
        }
        gameState.seats[seatIndex] = socket.id;
        io.emit('state_update', gameState);
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
      delete gameState.players[socket.id];
      delete gameState.heroPlayed[socket.id];
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

    socket.on('play_card', ({ cardId, x, y }) => {
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
          const tokenX = 0;
          const tokenY = isPlayer1 ? 311.7 : -311.7;
          if (card.heroClass) {
            const heroToken: Token = {
              id: generateId(),
              x: tokenX,
              y: tokenY,
              image: getHeroTokenImage(card.heroClass),
              label: `${card.heroClass} Lv1`,
              lv: 1,
              time: 0
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
          const allPlayed = Object.values(gameState.heroPlayed).filter(v => v).length >= 2;
          if (allPlayed) {
            gameState.decks.hero = [];
          }
        } else {
          if (card.type === 'action') {
            const playAreaX = 650;
            const playAreaY = 100;
            const offset = gameState.playAreaCards.length * 30;
            const tableCard: TableCard = { ...card, x: playAreaX + offset, y: playAreaY, faceUp: true };
            gameState.playAreaCards.push(tableCard);
          } else {
            const tableCard: TableCard = { ...card, x, y, faceUp: true };
            gameState.tableCards.push(tableCard);
          }
        }
        
        io.emit('state_update', gameState);
      }
    });

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

    socket.on('hire_hero', ({ cardId, goldAmount }) => {
      const player = gameState.players[socket.id];
      if (!player) return;

      const isPlayer1 = gameState.seats[0] === socket.id;
      const isPlayer2 = gameState.seats[1] === socket.id;
      if (!isPlayer1 && !isPlayer2) return; // Only seated players can hire

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
          time: 0
        };
        gameState.tokens.push(heroToken);
      }

      // Spawn Experience and Damage tokens
      gameState.counters.push({ id: generateId(), type: 'exp', x: heroX + 50, y: heroY - 30, value: goldAmount - 2, boundToCardId: tableCard.id });
      gameState.counters.push({ id: generateId(), type: 'damage', x: heroX + 50, y: heroY + 180, value: 0, boundToCardId: tableCard.id });

      io.emit('state_update', gameState);
    });

    socket.on('evolve_hero', (cardId) => {
      const card = gameState.tableCards.find(c => c.id === cardId);
      if (card && card.type === 'hero' && card.heroClass && card.level && card.level < 3) {
        card.level += 1;
        card.frontImage = getHeroCardImage(card.heroClass, card.level);
        card.backImage = getHeroBackImage(card.level);
        
        // Also update the token level
        const token = gameState.tokens.find(t => t.label?.startsWith(card.heroClass!));
        if (token) {
          token.lv = card.level;
          token.label = `${card.heroClass} Lv${card.level}`;
        }
        
        io.emit('state_update', gameState);
      }
    });

    socket.on('discard_card', (cardId) => {
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
    });

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
