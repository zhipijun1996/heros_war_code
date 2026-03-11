export interface Card {
  id: string;
  frontImage: string;
  backImage: string;
  type: 'treasure1' | 'treasure2' | 'treasure3' | 'action' | 'hero';
  heroClass?: string;
  level?: number;
}

export interface TableCard extends Card {
  x: number;
  y: number;
  faceUp: boolean;
}

export interface Token {
  id: string;
  x: number;
  y: number;
  image: string;
  label?: string;
  lv: number;
  time: number;
  boundToCardId?: string;
}

export interface Counter {
  id: string;
  x: number;
  y: number;
  value: number;
  type: 'gold' | 'exp' | 'damage' | 'time' | 'level';
  boundToCardId?: string;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
}

export interface ImageConfig {
  heroTokens: string[];
  heroCards: string[];
  actionCards: string[];
  t1Cards: string[];
  t2Cards: string[];
  t3Cards: string[];
}

export interface GameState {
  gameStarted: boolean;
  seats: (string | null)[];
  players: Record<string, Player>;
  tokens: Token[];
  tableCards: TableCard[];
  hireAreaCards: TableCard[];
  playAreaCards: TableCard[];
  decks: {
    treasure1: Card[];
    treasure2: Card[];
    treasure3: Card[];
    action: Card[];
    hero: Card[];
  };
  discardPiles: {
    action: Card[];
  };
  counters: Counter[];
  imageConfig?: ImageConfig;
  heroPlayed: Record<string, boolean>;
}
