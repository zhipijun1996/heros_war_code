import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Line } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { Socket } from 'socket.io-client';
import { GameState, TableCard, Token, Counter, Card, GameLog } from '../types';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TabletopProps {
  socket: Socket;
  gameState: GameState;
  setZoomedCard: (card: Card | null) => void;
  playerId: string;
  isHistoryVisible: boolean;
}

const HEX_SIZE = 45;

function pixelToHex(x: number, y: number) {
  const q = (2/3 * x) / HEX_SIZE;
  const r = (-1/3 * x + Math.sqrt(3)/3 * y) / HEX_SIZE;
  return hexRound(q, r);
}

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

function hexToPixel(q: number, r: number) {
  const x = HEX_SIZE * 1.5 * q;
  const y = HEX_SIZE * Math.sqrt(3) * (r + q/2);
  return { x, y };
}

function HexNode({ q, r, x, y, fill, icon, onContextMenu, highlightColor, onClick }: { q: number, r: number, x: number, y: number, fill: string, icon: string, onContextMenu: any, highlightColor?: string, onClick?: (q: number, r: number) => void }) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i;
    const angle_rad = Math.PI / 180 * angle_deg;
    points.push(x + HEX_SIZE * Math.cos(angle_rad));
    points.push(y + HEX_SIZE * Math.sin(angle_rad));
  }

  const isSpecial = fill !== "#ffffff";
  const timerRef = useRef<any>(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: any) => {
    if (!isSpecial) return;
    longPressTriggered.current = false;
    if (e.evt && e.evt.touches) {
      touchStartPos.current = { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY };
    }
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      onContextMenu(e, x, y, touchStartPos.current.x, touchStartPos.current.y);
    }, 500);
  };

  const handleTouchMove = (e: any) => {
    if (!isSpecial) return;
    if (!e.evt || !e.evt.touches) return;
    const dx = e.evt.touches[0].clientX - touchStartPos.current.x;
    const dy = e.evt.touches[0].clientY - touchStartPos.current.y;
    if (Math.sqrt(dx*dx + dy*dy) > 10) {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const handleTouchEnd = () => {
    if (!isSpecial) return;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleClick = (e: any) => {
    if (longPressTriggered.current) {
      e.cancelBubble = true;
      return;
    }
    if (onClick) {
      onClick(q, r);
    }
  };

  return (
    <Group 
      onContextMenu={(e) => {
        if (isSpecial) {
          e.cancelBubble = true;
          if (e.evt) e.evt.preventDefault();
          onContextMenu(e, x, y);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      onTap={handleClick}
    >
      <Line 
        points={points} 
        fill={highlightColor || fill} 
        stroke={highlightColor ? (highlightColor.includes('239') ? "#ef4444" : "#facc15") : "#a1a1aa"} 
        strokeWidth={highlightColor ? 4 : 1} 
        closed 
      />
      {icon && <Text x={x - HEX_SIZE/2} y={y - 12} width={HEX_SIZE} text={icon} fontSize={24} align="center" />}
    </Group>
  );
}

function HexGridLayer({ onHexContextMenu, reachableCells, onHexClick, selectedOption }: { onHexContextMenu: (e: any, x: number, y: number, clientX?: number, clientY?: number) => void, reachableCells?: { q: number, r: number }[], onHexClick?: (q: number, r: number) => void, selectedOption?: string | null }) {
  const hexes = [];
  const radius = 4;
  
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const x = HEX_SIZE * 1.5 * q;
      const y = HEX_SIZE * Math.sqrt(3) * (r + q/2);
      
      let fill = "#ffffff";
      let icon = "";
      
      if (q === 0 && r === 0) { fill = "#bfdbfe"; icon = "💎"; } // Crystal
      else if ((q === 0 && r === 4) || (q === 0 && r === -4)) { fill = "#d4d4d8"; icon = "🏰"; } // Castle
      else if ((q === -1 && r === 3) || (q === 1 && r === -3)) { fill = "#fef08a"; icon = "📦"; } // T1
      else if ((q === 1 && r === 1) || (q === -1 && r === -1)) { fill = "#fde68a"; icon = "👑"; } // T2
      else if ((q === -2 && r === 4) || (q === 2 && r === 2) || (q === -2 && r === -2) || (q === 2 && r === -4)) { fill = "#fbcfe8"; icon = "👾"; } // M1
      else if ((q === -3 && r === 3) || (q === -1 && r === 1) || (q === 3 && r === -3) || (q === 1 && r === -1)) { fill = "#f87171"; icon = "💀"; } // M2
      else if ((q === -3 && r === 1) || (q === 3 && r === -1)) { fill = "#fca5a5"; icon = "🐉"; } // M3
      
      const isReachable = reachableCells?.some(c => c.q === q && c.r === r);
      const isAttack = selectedOption === 'attack' || selectedOption === 'heavy_strike';
      const highlightColor = isReachable ? (isAttack ? "rgba(239, 68, 68, 0.4)" : "rgba(253, 224, 71, 0.4)") : undefined;

      hexes.push(
        <HexNode 
          key={`${q}-${r}`} 
          q={q} 
          r={r} 
          x={x} 
          y={y} 
          fill={fill} 
          icon={icon} 
          onContextMenu={onHexContextMenu} 
          highlightColor={highlightColor}
          onClick={onHexClick}
        />
      );
    }
  }

  return <Layer>{hexes}</Layer>;
}

function DeckNode({ x, y, type, count, label, backImage, onContextMenu, socket }: { x: number, y: number, type: string, count: number, label: string, backImage?: string, onContextMenu: (e: any, type: string) => void, socket: Socket }) {
  const [image] = useImage(backImage || '');
  const timerRef = useRef<any>(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: any) => {
    longPressTriggered.current = false;
    if (e.evt && e.evt.touches) {
      touchStartPos.current = { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY };
    }
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      onContextMenu(e, type);
    }, 500);
  };

  const handleTouchMove = (e: any) => {
    if (!e.evt || !e.evt.touches) return;
    const dx = e.evt.touches[0].clientX - touchStartPos.current.x;
    const dy = e.evt.touches[0].clientY - touchStartPos.current.y;
    if (Math.sqrt(dx*dx + dy*dy) > 10) {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleClick = (e: any) => {
    e.cancelBubble = true;
    if (longPressTriggered.current) return;
    if (type === 'action') {
      socket.emit('draw_card', type);
    } else {
      socket.emit('draw_card_to_table', type, x + 120, y);
    }
  };

  return (
    <Group 
      x={x} 
      y={y} 
      onClick={handleClick}
      onTap={handleClick}
      onContextMenu={(e) => onContextMenu(e, type)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <Rect width={100} height={150} fill="#27272a" cornerRadius={8} stroke="#52525b" strokeWidth={2} shadowColor="black" shadowBlur={10} shadowOpacity={0.5} />
      {count > 0 && image && (
        <KonvaImage image={image} width={100} height={150} cornerRadius={8} />
      )}
      <Group y={image && count > 0 ? 155 : 60}>
        <Rect width={100} height={40} fill="rgba(0,0,0,0.6)" cornerRadius={4} />
        <Text text={label} fill="white" width={100} align="center" y={5} fontStyle="bold" />
        <Text text={count.toString()} fill="#a1a1aa" width={100} align="center" y={22} fontSize={10} />
      </Group>
    </Group>
  );
}

function TokenNode({ token, socket, onClick, isSelected, draggable, lastEvolvedId, onHexClick, isMyToken }: { token: Token; socket: Socket, onClick?: (id: string) => void, isSelected?: boolean, draggable?: boolean, lastEvolvedId?: string | null, onHexClick?: (q: number, r: number) => void, isMyToken?: boolean }) {
  const [image] = useImage(token.image);
  const groupRef = useRef<any>(null);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.to({
        x: token.x,
        y: token.y,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut
      });
    }
  }, [token.x, token.y]);
  
  return (
    <Group
      ref={groupRef}
      x={token.x}
      y={token.y}
      draggable={draggable}
      listening={true}
      onClick={(e) => { 
        e.cancelBubble = true; 
        if (isMyToken) {
          onClick?.(token.id); 
        } else {
          const hex = pixelToHex(token.x, token.y);
          onHexClick?.(hex.q, hex.r);
        }
      }}
      onTap={(e) => { 
        e.cancelBubble = true; 
        if (isMyToken) {
          onClick?.(token.id); 
        } else {
          const hex = pixelToHex(token.x, token.y);
          onHexClick?.(hex.q, hex.r);
        }
      }}
      onDragEnd={(e) => {
        const newX = e.target.x();
        const newY = e.target.y();
        
        // Exclusion Zone check
        if (newX > 800 && newY > 400) {
          socket.emit('move_item', { type: 'token', id: token.id, x: newX, y: newY });
          return;
        }

        const hex = pixelToHex(newX, newY);
        if (Math.abs(hex.q) <= 4 && Math.abs(hex.r) <= 4 && Math.abs(-hex.q - hex.r) <= 4) {
          const snapped = hexToPixel(hex.q, hex.r);
          e.target.position({ x: snapped.x, y: snapped.y });
          e.target.getLayer()?.batchDraw();
          socket.emit('move_item', { type: 'token', id: token.id, x: snapped.x, y: snapped.y });
        } else {
          socket.emit('move_item', { type: 'token', id: token.id, x: newX, y: newY });
        }
      }}
    >
      <Circle 
        radius={30} 
        fill={isSelected ? "#4f46e5" : "#27272a"} 
        stroke={isSelected || lastEvolvedId === token.boundToCardId ? "#fbbf24" : "#52525b"} 
        strokeWidth={isSelected || lastEvolvedId === token.boundToCardId ? 5 : 2} 
        shadowColor={lastEvolvedId === token.boundToCardId ? "#fbbf24" : "black"}
        shadowBlur={lastEvolvedId === token.boundToCardId ? 30 : 10} 
        shadowOpacity={0.9} 
        shadowOffset={{ x: 2, y: 2 }} 
      />
      {lastEvolvedId === token.boundToCardId && (
        <Circle radius={40} stroke="#fbbf24" strokeWidth={3} dash={[5, 5]} opacity={0.8} />
      )}
      {image && (
        <Circle radius={28} fillPatternImage={image} fillPatternScale={{ x: 56 / image.width, y: 56 / image.height }} fillPatternOffset={{ x: image.width / 2, y: image.height / 2 }} />
      )}
      {token.label && (
        <Text text={token.label} fill="white" y={35} x={-40} width={80} align="center" fontSize={12} fontStyle="bold" shadowColor="black" shadowBlur={2} />
      )}
    </Group>
  );
}

function CardNode({ card, socket, onContextMenu, onZoom, onClick, isSelected, lastEvolvedId }: { card: TableCard; socket: Socket, onContextMenu: (e: any, id: string) => void, onZoom: (card: TableCard) => void, onClick?: (id: string) => void, isSelected?: boolean, lastEvolvedId?: string | null }) {
  const [frontImage] = useImage(card.frontImage);
  const [backImage] = useImage(card.backImage);
  
  const image = card.faceUp ? frontImage : backImage;
  const isHeroOnTable = card.type === 'hero' && (card.y === 550 || card.y === -700);

  const timerRef = useRef<any>(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: any) => {
    longPressTriggered.current = false;
    if (e.evt && e.evt.touches) {
      touchStartPos.current = { x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY };
    }
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      onContextMenu(e, card.id);
    }, 500);
  };

  const handleTouchMove = (e: any) => {
    if (!e.evt || !e.evt.touches) return;
    const dx = e.evt.touches[0].clientX - touchStartPos.current.x;
    const dy = e.evt.touches[0].clientY - touchStartPos.current.y;
    if (Math.sqrt(dx*dx + dy*dy) > 10) {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!longPressTriggered.current && onClick) {
      onClick(card.id);
    }
  };

  const handleClick = (e: any) => {
    if (longPressTriggered.current) {
      e.cancelBubble = true;
      return;
    }
    if (onClick) {
      onClick(card.id);
    }
  };

  const handleDblClick = (e: any) => {
    e.cancelBubble = true;
    if (longPressTriggered.current) return;
    onZoom(card);
  };

  return (
    <Group
      x={card.x}
      y={card.y}
      draggable={!isHeroOnTable}
      onDragStart={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
      }}
      onDragEnd={(e) => {
        const newX = e.target.x();
        const newY = e.target.y();
        
        // Exclusion Zone check
        if (newX > 800 && newY > 400) {
          socket.emit('move_item', { type: 'card', id: card.id, x: newX, y: newY });
          return;
        }

        if (newX > 400 && newX < 550 && newY > 50 && newY < 250) {
          socket.emit('discard_card', card.id);
        } else {
          socket.emit('move_item', { type: 'card', id: card.id, x: newX, y: newY });
        }
      }}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onClick={handleClick}
      onTap={handleClick}
      onContextMenu={(e) => onContextMenu(e, card.id)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <Rect
        width={100}
        height={150}
        fill="#18181b"
        cornerRadius={8}
        shadowColor={lastEvolvedId === card.id ? "#fbbf24" : "black"}
        shadowBlur={lastEvolvedId === card.id ? 40 : 10}
        shadowOpacity={0.9}
        shadowOffset={{ x: 2, y: 2 }}
        stroke={lastEvolvedId === card.id ? "#fbbf24" : (isSelected ? "#fbbf24" : "#3f3f46")}
        strokeWidth={lastEvolvedId === card.id || isSelected ? 5 : 1}
      />
      {lastEvolvedId === card.id && (
        <Rect 
          width={120} 
          height={170} 
          x={-10} 
          y={-10} 
          stroke="#fbbf24" 
          strokeWidth={3} 
          dash={[10, 5]} 
          cornerRadius={12}
          opacity={0.8}
        />
      )}
      {image && (
        <KonvaImage
          image={image}
          width={100}
          height={150}
          cornerRadius={8}
        />
      )}
    </Group>
  );
}

function CounterNode({ counter, socket }: { counter: Counter; socket: Socket }) {
  const colors = {
    gold: '#fbbf24',
    exp: '#34d399',
    damage: '#f87171',
    time: '#60a5fa',
    level: '#a78bfa'
  };
  
  const labels = {
    gold: '',
    exp: '',
    damage: '',
    time: 'T',
    level: 'Lv'
  };

  return (
    <Group
      x={counter.x}
      y={counter.y}
      draggable
      onDragEnd={(e) => {
        const newX = e.target.x();
        const newY = e.target.y();

        // Exclusion Zone check
        if (newX > 800 && newY > 400) {
          socket.emit('move_item', { type: 'counter', id: counter.id, x: newX, y: newY });
          return;
        }

        const hex = pixelToHex(newX, newY);
        if (Math.abs(hex.q) <= 4 && Math.abs(hex.r) <= 4 && Math.abs(-hex.q - hex.r) <= 4) {
          const snapped = hexToPixel(hex.q, hex.r);
          e.target.position({ x: snapped.x, y: snapped.y });
          e.target.getLayer()?.batchDraw();
          socket.emit('move_item', { type: 'counter', id: counter.id, x: snapped.x, y: snapped.y });
        } else {
          socket.emit('move_item', { type: 'counter', id: counter.id, x: newX, y: newY });
        }
      }}
    >
      <Circle radius={25} fill={colors[counter.type]} shadowColor="black" shadowBlur={5} shadowOpacity={0.3} shadowOffset={{ x: 1, y: 1 }} />
      <Text
        text={`${labels[counter.type]}${counter.value}`}
        fontSize={20}
        fontStyle="bold"
        fill="#18181b"
        x={-25}
        y={-10}
        width={50}
        align="center"
      />
      
      {/* Minus button */}
      <Group x={-35} y={0} onClick={(e) => { e.cancelBubble = true; socket.emit('update_counter', { id: counter.id, delta: -1 }); }} onTap={(e) => { e.cancelBubble = true; socket.emit('update_counter', { id: counter.id, delta: -1 }); }}>
        <Circle radius={15} fill="#3f3f46" />
        <Text text="-" fill="white" x={-4} y={-6} fontSize={14} fontStyle="bold" />
      </Group>

      {/* Plus button */}
      <Group x={35} y={0} onClick={(e) => { e.cancelBubble = true; socket.emit('update_counter', { id: counter.id, delta: 1 }); }} onTap={(e) => { e.cancelBubble = true; socket.emit('update_counter', { id: counter.id, delta: 1 }); }}>
        <Circle radius={15} fill="#3f3f46" />
        <Text text="+" fill="white" x={-4} y={-6} fontSize={14} fontStyle="bold" />
      </Group>
    </Group>
  );
}

function HistoryLogGroup({ logs, isVisible, position, onDragEnd }: { logs: GameLog[], isVisible: boolean, position: { x: number, y: number }, onDragEnd: (pos: { x: number, y: number }) => void }) {
  if (!isVisible) return null;
  const displayLogs = logs.slice(-18); // Show last 18 logs
  return (
    <Group x={position.x} y={position.y} draggable onDragEnd={(e) => onDragEnd({ x: e.target.x(), y: e.target.y() })}>
      <Rect 
        width={350} 
        height={450} 
        fill="rgba(24, 24, 27, 0.7)" 
        stroke="#3f3f46" 
        strokeWidth={2} 
        cornerRadius={12} 
        shadowColor="black"
        shadowBlur={10}
        shadowOpacity={0.3}
      />
      <Rect 
        width={350} 
        height={40} 
        fill="rgba(39, 39, 42, 0.8)" 
        cornerRadius={[12, 12, 0, 0]} 
      />
      <Text 
        text="历史记录 (History)" 
        fill="#e4e4e7" 
        fontSize={16} 
        fontStyle="bold" 
        x={15} 
        y={12} 
      />
      {displayLogs.map((log, i) => (
        <Group key={log.id} y={55 + i * 20}>
           <Text 
             text={`[${log.round}]`} 
             fill="#a1a1aa" 
             fontSize={12} 
             fontStyle="bold"
             x={15} 
           />
           <Text 
             text={log.message} 
             fill={log.playerIndex === 0 ? '#60a5fa' : log.playerIndex === 1 ? '#f87171' : '#d4d4d8'} 
             fontSize={13} 
             x={55}
             width={280}
             wrap="word"
           />
        </Group>
      ))}
    </Group>
  );
}

export default function Tabletop({ socket, gameState, setZoomedCard, playerId, isHistoryVisible }: TabletopProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const calculateInitialScale = (w: number, h: number) => {
    const targetWidth = 1000;
    const targetHeight = 1600;
    return Math.min(w / targetWidth, h / targetHeight, 1);
  };

  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [stagePos, setStagePos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [stageScale, setStageScale] = useState(() => calculateInitialScale(window.innerWidth, window.innerHeight));
  const [menu, setMenu] = useState<{ x: number, y: number, type: 'deck' | 'card' | 'hex', targetId: string, targetX?: number, targetY?: number } | null>(null);
  const [hirePopup, setHirePopup] = useState<{ cardId: string } | null>(null);
  const [showExplosion, setShowExplosion] = useState<{ x: number, y: number } | null>(null);
  const [historyPos, setHistoryPos] = useState({ x: -850, y: -450 });

  useEffect(() => {
    if (gameState.lastEvolvedId) {
      const card = gameState.tableCards.find(c => c.id === gameState.lastEvolvedId);
      if (card) {
        setShowExplosion({ x: card.x + 50, y: card.y + 75 });
        setTimeout(() => setShowExplosion(null), 1000);
      }
    }
  }, [gameState.lastEvolvedId, gameState.tableCards]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPromptHidden, setIsPromptHidden] = useState(false);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [showJoinOverlay, setShowJoinOverlay] = useState(false);
  const lastCenter = useRef<{ x: number, y: number } | null>(null);
  const lastDist = useRef<number>(0);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
        setStagePos({
          x: containerRef.current.offsetWidth / 2,
          y: containerRef.current.offsetHeight / 2
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const handleErrorMessage = (msg: string) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 3000);
    };
    socket.on('error_message', handleErrorMessage);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.off('error_message', handleErrorMessage);
    };
  }, [socket]);

  const getDistance = (p1: any, p2: any) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  const getCenter = (p1: any, p2: any) => {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  };

  const handleTouchMove = (e: any) => {
    e.evt.preventDefault();
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (touch1 && touch2) {
      const stage = e.target.getStage();
      if (!stage) return;

      if (stage.isDragging()) {
        stage.stopDrag();
      }

      const p1 = { x: touch1.clientX, y: touch1.clientY };
      const p2 = { x: touch2.clientX, y: touch2.clientY };

      if (!lastCenter.current) {
        lastCenter.current = getCenter(p1, p2);
        lastDist.current = getDistance(p1, p2);
        stage.setAttr('startScale', stage.scaleX());
        stage.setAttr('startPos', stage.position());
        return;
      }

      const newCenter = getCenter(p1, p2);
      const dist = getDistance(p1, p2);

      const startScale = stage.getAttr('startScale');
      const startPos = stage.getAttr('startPos');
      const startCenter = lastCenter.current;
      const startDist = lastDist.current;

      if (!startScale || !startPos || !startDist) return;

      const scale = startScale * (dist / startDist);

      const pointTo = {
        x: (startCenter.x - startPos.x) / startScale,
        y: (startCenter.y - startPos.y) / startScale,
      };

      const newPos = {
        x: newCenter.x - pointTo.x * scale,
        y: newCenter.y - pointTo.y * scale,
      };

      stage.scaleX(scale);
      stage.scaleY(scale);
      stage.position(newPos);
      stage.batchDraw();

      setStageScale(scale);
      setStagePos(newPos);
    }
  };

  const handleTouchEnd = (e: any) => {
    lastDist.current = 0;
    lastCenter.current = null;
    
    const stage = e.target.getStage();
    if (stage) {
      setStageScale(stage.scaleX());
      setStagePos(stage.position());
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: stage.getPointerPosition().x / oldScale - stage.x() / oldScale,
      y: stage.getPointerPosition().y / oldScale - stage.y() / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);
    setStagePos({
      x: -(mousePointTo.x - stage.getPointerPosition().x / newScale) * newScale,
      y: -(mousePointTo.y - stage.getPointerPosition().y / newScale) * newScale,
    });
  };

  const zoomIn = () => setStageScale(s => s * 1.2);
  const zoomOut = () => setStageScale(s => s / 1.2);
  const resetZoom = () => {
    setStageScale(calculateInitialScale(size.width, size.height));
    setStagePos({ x: size.width / 2, y: size.height / 2 });
  };

  const handleDeckContextMenu = (e: any, type: string) => {
    e.cancelBubble = true;
    if (e.evt) e.evt.preventDefault();
    
    const pointerPos = e.target.getStage().getPointerPosition();
    
    setMenu({ x: pointerPos.x, y: pointerPos.y, type: 'deck', targetId: type });
  };

  const handleCardContextMenu = (e: any, id: string) => {
    e.cancelBubble = true;
    if (e.evt) e.evt.preventDefault();
    
    const pointerPos = e.target.getStage().getPointerPosition();
    
    setMenu({ x: pointerPos.x, y: pointerPos.y, type: 'card', targetId: id });
  };

  const handleHexContextMenu = (e: any, x: number, y: number, clientX?: number, clientY?: number) => {
    e.cancelBubble = true;
    try {
      if (e.evt && typeof e.evt.preventDefault === 'function') e.evt.preventDefault();
    } catch (err) {}
    
    let pointerPos = e.target.getStage().getPointerPosition();
    
    if (!pointerPos && clientX !== undefined && clientY !== undefined) {
      const container = e.target.getStage().container();
      if (container) {
        const rect = container.getBoundingClientRect();
        pointerPos = {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      }
    }
    
    if (pointerPos) {
      setMenu({ x: pointerPos.x, y: pointerPos.y, type: 'hex', targetId: `${x},${y}`, targetX: x, targetY: y });
    }
  };

  const BASE_URL = 'https://raw.githubusercontent.com/zhipijun1996/heros_war/main/';

  const isPlayer1 = gameState.seats[0] === playerId;
  const isPlayer2 = gameState.seats[1] === playerId;
  const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
  const isActivePlayer = playerIndex === gameState.activePlayerIndex;

  const getPromptText = () => {
    if (gameState.phase === 'setup') {
      if (playerIndex !== -1 && !gameState.heroPlayed[playerId]) {
        return "准备阶段：请选择初始英雄（其他英雄将进入雇佣区）";
      } else if (playerIndex !== -1 && gameState.heroPlayed[playerId]) {
        return "准备阶段：等待对手选择初始英雄";
      }
      return "准备阶段：等待双方选择初始英雄";
    }

    const activePlayerStr = `玩家${gameState.activePlayerIndex + 1}`;
    const inactivePlayerStr = `玩家${1 - gameState.activePlayerIndex + 1}`;
    
    if (gameState.phase === 'action_play') {
      return `行动阶段：请${activePlayerStr}出牌或Pass`;
    }
    if (gameState.phase === 'action_select_option') {
      if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
        if (!gameState.selectedTokenId) return "请选择一个英雄Token进行移动 (Select a hero token to move)";
        const token = gameState.tokens.find(t => t.id === gameState.selectedTokenId);
        return `正在移动 ${token?.label || '英雄'} (剩余移动力: ${gameState.remainingMv}) | Moving ${token?.label || 'Hero'} (Remaining MV: ${gameState.remainingMv})`;
      }
      if (!gameState.selectedOption) {
        return `请选择行动选项 (Select Action Option)`;
      } else if (gameState.selectedOption === 'heavy_strike') {
        if (!gameState.secondaryCardId) {
          return `强击：请打出一张行动卡作为攻击卡 (Heavy Strike: Play an action card as attack)`;
        } else {
          return `强击卡已准备，请点击完成结算 (Heavy Strike ready, click Finish Resolve)`;
        }
      } else if (gameState.selectedOption === 'heal') {
        if (!gameState.selectedTargetId) {
          return `回复：请在桌面上选择一个要回复的英雄 (Heal: Select a hero on the table)`;
        } else {
          return `已选择回复目标，请点击完成结算 (Target selected, click Finish Resolve)`;
        }
      } else if (gameState.selectedOption === 'evolve') {
        if (!gameState.selectedTargetId) {
          return `进化：请在桌面上选择一个要进化的英雄 (Evolve: Select a hero on the table)`;
        } else {
          return `已选择进化目标，请点击完成结算 (Target selected, click Finish Resolve)`;
        }
      } else if (gameState.selectedOption === 'spy') {
        return `间谍：点击完成结算以随机弃掉对手一张手牌 (Spy: Click Finish Resolve to discard opponent's card)`;
      } else if (gameState.selectedOption === 'seize') {
        return `抢先手：点击完成结算以获得下回合先手 (Seize: Click Finish Resolve to get initiative)`;
      } else if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
        if (gameState.selectedTokenId) {
          return `已选择英雄，请点击高亮的格子以移动 (Hero selected, click a highlighted cell to move)`;
        }
        return `移动：请选择一个己方英雄 (Move: Select a hero)`;
      } else if (gameState.selectedOption === 'attack') {
        if (gameState.selectedTokenId) {
          return `已选择英雄，请点击高亮的攻击目标 (Hero selected, click a highlighted target)`;
        }
        return `攻击：请选择一个己方英雄 (Attack: Select a hero)`;
      }
      return `结算阶段：请${activePlayerStr}结算场面`;
    }
    if (gameState.phase === 'action_defend') {
      const hasDefenseCard = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
      if (hasDefenseCard) {
        return `防御阶段：请${activePlayerStr}选择防御或反击 (Choose Defend or Counter)`;
      }
      return `防御阶段：请${activePlayerStr}打出防御卡（或Pass） (Play a defense card or Pass)`;
    }
    if (gameState.phase === 'action_resolve_attack') {
      return `攻击结算：请${activePlayerStr}结算攻击`;
    }
    if (gameState.phase === 'action_resolve_attack_counter') {
      return `攻击结算：请${activePlayerStr}结算攻击 (Settle attack)`;
    }
    if (gameState.phase === 'action_resolve_counter') {
      return `反击结算：请${activePlayerStr}结算反击 (Settle counter-attack)`;
    }
    if (gameState.phase === 'shop') {
      return `商店阶段：请${activePlayerStr}购买装备或雇佣英雄`;
    }
    if (gameState.phase === 'supply') {
      return `补给阶段：双方抽取卡牌（英雄数+1）`;
    }
    if (gameState.phase === 'discard') {
      return `弃牌阶段：请检查手牌并弃掉多余卡牌`;
    }
    if (gameState.phase === 'end') {
      return `结束阶段：时间计数+1`;
    }
    return "";
  };

  const getPromptButtons = () => {
    if (!isActivePlayer && gameState.phase !== 'supply' && gameState.phase !== 'end' && gameState.phase !== 'discard') return null;

    if (gameState.phase === 'action_play') {
      if (gameState.comboState === 'heavy_strike') {
        return (
          <button onClick={() => socket.emit('cancel_combo')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">
            撤回 (Cancel)
          </button>
        );
      }
      return (
        <button onClick={() => socket.emit('pass_action')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
          Pass
        </button>
      );
    }
    if (gameState.phase === 'action_select_option') {
      let playedCard = null;
      if (gameState.lastPlayedCardId) {
        playedCard = gameState.playAreaCards.find(c => c.id === gameState.lastPlayedCardId) || 
                     gameState.tableCards.find(c => c.id === gameState.lastPlayedCardId);
      }

      if (!gameState.selectedOption) {
        const isFirstPlayer = gameState.seats[gameState.firstPlayerIndex] === playerId;
        const canSeize = !isFirstPlayer && !gameState.hasSeizedInitiative;

        return (
          <div className="flex gap-4 flex-wrap justify-center">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
            {canSeize && (
              <button onClick={() => socket.emit('select_option', 'seize')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold">
                抢先手
              </button>
            )}
            {gameState.canEvolve && (
              <button onClick={() => socket.emit('select_option', 'evolve')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
                进化
              </button>
            )}
            {gameState.canHire && (
              <button onClick={() => socket.emit('select_option', 'hire')} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-bold">
                雇佣
              </button>
            )}
            {(gameState as any).canOpenChest && (
              <button onClick={() => socket.emit('open_chest')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold">
                开宝箱
              </button>
            )}
            <button onClick={() => socket.emit('select_option', 'buy')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold">
              购买
            </button>
            
            {playedCard && playedCard.type === 'action' && playedCard.name !== '防御' && (
              <>
                {playedCard.name === '间谍' ? (
                  <button onClick={() => socket.emit('select_option', 'spy')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold">
                    间谍
                  </button>
                ) : playedCard.name === '强击' ? (
                  <button onClick={() => socket.emit('select_option', 'heavy_strike')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">
                    强击
                  </button>
                ) : playedCard.name === '冲刺' ? (
                  <button onClick={() => socket.emit('select_option', 'sprint')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
                    冲刺
                  </button>
                ) : playedCard.name === '回复' ? (
                  <button onClick={() => socket.emit('select_option', 'heal')} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold">
                    回复
                  </button>
                ) : (
                  <>
                    <button onClick={() => socket.emit('select_option', 'move')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold">
                      移动
                    </button>
                    <button onClick={() => socket.emit('select_option', 'attack')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">
                      攻击
                    </button>
                    <button onClick={() => socket.emit('select_option', 'skill')} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold">
                      技能
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        );
      } else if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint') {
        return (
          <div className="flex gap-4">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
            <button onClick={() => socket.emit('finish_resolve')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
              结束结算
            </button>
          </div>
        );
      } else if (gameState.selectedOption === 'evolve') {
        const evolvableHeroes = gameState.tableCards.filter(c => gameState.evolvableHeroIds?.includes(c.id));
        
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="flex gap-2 flex-wrap justify-center">
              {evolvableHeroes.map(hero => (
                <button 
                  key={hero.id}
                  onClick={() => socket.emit('select_target', hero.id)}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${gameState.selectedTargetId === hero.id ? 'bg-blue-500 text-white ring-2 ring-white' : 'bg-blue-900/50 text-blue-200 hover:bg-blue-800'}`}
                >
                  {hero.heroClass} (Lv{hero.level} {'->'} Lv{hero.level! + 1})
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
              <button 
                onClick={() => socket.emit('finish_resolve')} 
                disabled={!gameState.selectedTargetId}
                className={`px-4 py-2 rounded-lg font-bold ${gameState.selectedTargetId ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
              >
                确定进化
              </button>
            </div>
          </div>
        );
      } else if (gameState.selectedOption === 'hire') {
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请选择雇佣费用 (Select hire cost)</div>
            <div className="flex gap-2 flex-wrap justify-center">
              {[2, 3, 4, 5, 6, 7, 8, 9].map(cost => (
                <button 
                  key={cost}
                  onClick={() => socket.emit('hire_hero', { cardId: gameState.selectedTargetId, goldAmount: cost })}
                  className={`px-4 py-2 rounded-lg font-bold ${gameState.selectedTargetId ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                  disabled={!gameState.selectedTargetId}
                >
                  {cost} 金币
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
            </div>
          </div>
        );
      } else if (gameState.selectedOption === 'heal') {
        const healableHeroes = gameState.tableCards.filter(c => gameState.healableHeroIds?.includes(c.id));
        
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="flex gap-2 flex-wrap justify-center">
              {healableHeroes.map(hero => (
                <button 
                  key={hero.id}
                  onClick={() => socket.emit('select_target', hero.id)}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${gameState.selectedTargetId === hero.id ? 'bg-green-500 text-white ring-2 ring-white' : 'bg-green-900/50 text-green-200 hover:bg-green-800'}`}
                >
                  {hero.heroClass} (HP: {hero.damage && hero.damage > 0 ? `-${hero.damage}` : 'Full'})
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
              <button 
                onClick={() => socket.emit('finish_resolve')} 
                disabled={!gameState.selectedTargetId}
                className={`px-4 py-2 rounded-lg font-bold ${gameState.selectedTargetId ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
              >
                确定回复
              </button>
            </div>
          </div>
        );
      } else if (gameState.selectedOption === 'attack' || (gameState.selectedOption === 'heavy_strike' && gameState.secondaryCardId)) {
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">
              {gameState.selectedTokenId ? '请点击高亮的攻击目标 (Click a highlighted target)' : '请选择己方英雄 (Select your hero)'}
            </div>
            <div className="flex gap-4">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
            </div>
          </div>
        );
      } else if (gameState.selectedOption === 'heavy_strike' && !gameState.secondaryCardId) {
        return (
          <div className="flex flex-col gap-4 items-center">
            <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">
              请打出一张行动卡作为攻击卡 (Play an action card as attack)
            </div>
            <div className="flex gap-4">
              <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
                撤回
              </button>
            </div>
          </div>
        );
      } else {
        return (
          <div className="flex gap-4">
            <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
              撤回
            </button>
            <button onClick={() => socket.emit('finish_resolve')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
              完成结算
            </button>
          </div>
        );
      }
    }
    if (gameState.phase === 'action_defend') {
      const hasDefenseCard = gameState.playAreaCards.some(c => c.name === '防御' || c.name === '闪避');
      return (
        <div className="flex gap-4">
          {hasDefenseCard && (
            <>
              <button onClick={() => socket.emit('declare_defend')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
                防御
              </button>
              <button onClick={() => socket.emit('declare_counter')} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold">
                反击
              </button>
            </>
          )}
          <button onClick={() => socket.emit('pass_defend')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
            Pass
          </button>
          <button onClick={() => socket.emit('undo_play')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
            撤回
          </button>
        </div>
      );
    }
    if (gameState.phase === 'action_play_defense' || gameState.phase === 'action_play_counter') {
      return (
        <button onClick={() => socket.emit('cancel_defend_or_counter')} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-bold">
          撤回 (Cancel)
        </button>
      );
    }
    if (gameState.phase === 'action_resolve_attack') {
      return (
        <button onClick={() => socket.emit('end_resolve_attack')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
          结束结算
        </button>
      );
    }
    if (gameState.phase === 'action_resolve_attack_counter') {
      return (
        <button onClick={() => socket.emit('end_resolve_attack_counter')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
          结束结算
        </button>
      );
    }
    if (gameState.phase === 'action_resolve_counter') {
      return (
        <button onClick={() => socket.emit('end_resolve_counter')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">
          结束结算
        </button>
      );
    }
    if (gameState.phase === 'shop') {
      return (
        <div className="flex gap-4">
          <button onClick={() => socket.emit('select_option', 'buy')} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold">
            购买
          </button>
          <button onClick={() => socket.emit('select_option', 'hire')} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-bold">
            雇佣
          </button>
          <button onClick={() => socket.emit('pass_shop')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-bold">
            Pass
          </button>
        </div>
      );
    }
    if (gameState.phase === 'discard') {
      const myPlayer = gameState.players[playerId];
      if (myPlayer) {
        return (
          <div className="flex flex-col gap-4 items-center">
            {myPlayer.hand.length > 5 ? (
              <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">请弃牌至5张以下 (Discard down to 5 cards)</div>
            ) : (
              <div className="text-white font-bold mb-2 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">手牌已就绪，请点击结束弃牌</div>
            )}
            <div className="flex gap-4">
              <button 
                onClick={() => socket.emit('undo_discard')} 
                disabled={myPlayer.discardFinished}
                className={`px-4 py-2 rounded-lg font-bold ${myPlayer.discardFinished ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-zinc-600 hover:bg-zinc-500 text-white'}`}
              >
                撤回弃牌
              </button>
              <button 
                onClick={() => socket.emit('finish_discard')} 
                disabled={myPlayer.hand.length > 5 || myPlayer.discardFinished}
                className={`px-4 py-2 rounded-lg font-bold ${myPlayer.hand.length > 5 || myPlayer.discardFinished ? 'bg-zinc-500 text-zinc-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
              >
                结束弃牌
              </button>
            </div>
          </div>
        );
      } else {
        return (
          <div className="text-white font-bold bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">等待对方弃牌... (Waiting for opponent...)</div>
        );
      }
    }
    if (gameState.phase === 'supply' || gameState.phase === 'end') {
      return (
        <button onClick={() => socket.emit('proceed_phase')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold">
          继续 (Proceed)
        </button>
      );
    }
    return null;
  };

  const handleHexClick = (q: number, r: number) => {
    if (gameState.phase === 'action_select_option' && isActivePlayer && gameState.selectedTokenId) {
      socket.emit('move_token_to_cell', { q, r });
    }
  };

  const handleTokenClick = (id: string) => {
    if (gameState.phase === 'action_select_option' && isActivePlayer) {
      if (gameState.selectedOption === 'move' || gameState.selectedOption === 'sprint' || gameState.selectedOption === 'attack' || gameState.selectedOption === 'heavy_strike') {
        socket.emit('select_token', id);
      }
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-[#1e1e24] relative touch-none" onContextMenu={(e) => e.preventDefault()}>
      {errorMsg && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl z-[300] font-bold animate-bounce pointer-events-none">
          {errorMsg}
        </div>
      )}

      {/* Prompt Area */}
      {gameState.gameStarted && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto flex flex-col items-center gap-2">
          {!isPromptHidden ? (
            <div className="bg-zinc-800/90 border border-zinc-700 rounded-xl p-4 shadow-2xl flex flex-col items-center gap-2 backdrop-blur-sm min-w-[300px] max-w-[80vw] text-center relative">
              <button 
                onClick={() => setIsPromptHidden(true)}
                className="absolute top-2 right-2 text-zinc-400 hover:text-white"
                title="隐藏提示 (Hide Prompt)"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
              <div className={`text-lg font-bold whitespace-pre-line ${gameState.activePlayerIndex === 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {gameState.notification ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-indigo-300">{gameState.notification}</p>
                    <button 
                      onClick={() => socket.emit('clear_notification')}
                      className="px-8 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
                    >
                      确定 (Confirm)
                    </button>
                  </div>
                ) : getPromptText()}
              </div>
              {!gameState.notification && (
                <div className="flex gap-4 mt-2">
                  {getPromptButtons()}
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={() => setIsPromptHidden(false)}
              className="bg-zinc-800/90 border border-zinc-700 rounded-full px-4 py-2 shadow-lg backdrop-blur-sm text-zinc-300 hover:text-white font-bold text-sm"
            >
              显示提示 (Show Prompt)
            </button>
          )}
        </div>
      )}

      {/* Spectator Join Button */}
      {gameState.gameStarted && playerIndex === -1 && !showJoinOverlay && (
        <button 
          onClick={() => setShowJoinOverlay(true)}
          className="absolute top-20 right-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg z-50 pointer-events-auto"
        >
          加入游戏 (Join Game)
        </button>
      )}

      {/* Start Game Overlay */}
      {(!gameState.gameStarted || showJoinOverlay) && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[200] pointer-events-auto backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-6 relative">
            {gameState.notification && !gameState.gameStarted && (
              <div className="text-xl font-bold text-emerald-400 text-center mb-4 animate-pulse">
                {gameState.notification}
              </div>
            )}
            {gameState.gameStarted && (
              <button 
                onClick={() => setShowJoinOverlay(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
            <h2 className="text-2xl font-bold text-white text-center">欢迎进行勇者之争桌游1.0测试</h2>
            
            <div className="w-full flex flex-col gap-3">
              <div className="flex flex-col gap-2 mb-2">
                <label className="text-zinc-400 text-sm">输入名称 (Enter Name):</label>
                <input 
                  type="text" 
                  value={playerNameInput}
                  onChange={(e) => setPlayerNameInput(e.target.value)}
                  placeholder="Your Name"
                  className="bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-lg outline-none focus:border-indigo-500"
                />
              </div>
              {[0, 1, 2, 3].map((seatIndex) => {
                const occupantId = gameState.seats?.[seatIndex];
                const isMe = occupantId === playerId;
                const isOccupied = occupantId !== null;
                const occupantName = isOccupied ? gameState.players[occupantId]?.name || 'Player' : '';

                return (
                  <div key={seatIndex} className="flex items-center justify-between bg-zinc-800 p-3 rounded-xl border border-zinc-700">
                    <span className="text-zinc-300 font-medium">玩家 {seatIndex + 1}</span>
                    {isOccupied ? (
                      <div className="flex items-center gap-3">
                        <span className="text-indigo-400 text-sm">{isMe ? '你 (You)' : occupantName}</span>
                        {isMe && (
                          <button 
                            onClick={() => socket.emit('leave_seat')}
                            className="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
                          >
                            离开 (Leave)
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            if (!playerNameInput.trim()) {
                              setErrorMsg("请输入名称 (Please enter a name)");
                              setTimeout(() => setErrorMsg(null), 3000);
                              return;
                            }
                            socket.emit('sit_down', { seatIndex, playerName: playerNameInput.trim() });
                            if (gameState.gameStarted) {
                              setShowJoinOverlay(false);
                            }
                          }}
                          className="px-4 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors"
                        >
                          坐下 (Sit)
                        </button>
                        <div className="flex bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700">
                          {[0, 1, 2].map(diff => (
                            <button
                              key={diff}
                              onClick={() => socket.emit('add_bot', { seatIndex, difficulty: diff })}
                              className="px-2 py-1 hover:bg-indigo-600 text-zinc-400 hover:text-white text-xs transition-colors border-r border-zinc-700 last:border-r-0"
                              title={`添加难度 ${diff} 电脑`}
                            >
                              AI{diff}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!gameState.gameStarted && (
              <button 
                onClick={() => socket.emit(gameState.notification?.includes('游戏结束') ? 'reset_game' : 'start_game')}
                className="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-lg font-bold shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all"
              >
                {gameState.notification?.includes('游戏结束') ? '重置游戏 (Reset Game)' : '确定 (Start Game)'}
              </button>
            )}
          </div>
        </div>
      )}

      <Stage 
        width={size.width} 
        height={size.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onClick={() => setMenu(null)}
        onTap={() => setMenu(null)}
      >
        <HexGridLayer 
          onHexContextMenu={handleHexContextMenu} 
          reachableCells={gameState.reachableCells}
          onHexClick={handleHexClick}
          selectedOption={gameState.selectedOption}
        />
        
        <Layer>
          {/* First Player Token */}
          {gameState.gameStarted && (
            <Group x={-200} y={gameState.firstPlayerIndex === 0 ? 550 : -700}>
              <Circle radius={20} fill="#f59e0b" stroke="#b45309" strokeWidth={4} />
              <Text text="1st" fill="white" fontSize={16} fontStyle="bold" x={-12} y={-8} />
            </Group>
          )}

          {/* Zones UI */}
          <Group x={120} y={-530}>
            <Rect width={700} height={200} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" strokeWidth={2} dash={[10, 5]} cornerRadius={10} />
            <Text text="雇佣区 (Hire Area)" fill="rgba(255,255,255,0.2)" width={700} align="center" y={10} fontSize={20} fontStyle="bold" />
          </Group>

          <Group x={800} y={400}>
            <Rect width={200} height={200} fill="rgba(239,68,68,0.05)" stroke="rgba(239,68,68,0.2)" strokeWidth={2} dash={[10, 5]} cornerRadius={10} />
            <Text text="除外区 (Exclusion)" fill="rgba(239,68,68,0.3)" width={200} align="center" y={90} fontSize={16} fontStyle="bold" />
          </Group>

          {/* Decks */}
          <DeckNode x={-500} y={-200} type="treasure1" count={gameState.decks.treasure1.length} socket={socket} label="t1" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_t1.png`} onContextMenu={handleDeckContextMenu} />
          <DeckNode x={-500} y={0} type="treasure2" count={gameState.decks.treasure2.length} socket={socket} label="t2" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8Ct2.png`} onContextMenu={handleDeckContextMenu} />
          <DeckNode x={-500} y={200} type="treasure3" count={gameState.decks.treasure3.length} socket={socket} label="t3" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_t3.png`} onContextMenu={handleDeckContextMenu} />
          
          <DeckNode x={450} y={-100} type="action" count={gameState.decks.action.length} socket={socket} label="公共牌堆" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_%E5%85%AC%E5%85%B1%E7%89%8C%E5%A0%86.png`} onContextMenu={handleDeckContextMenu} />
          {gameState.decks.hero.length > 0 && (
            <DeckNode x={450} y={300} type="hero" count={gameState.decks.hero.length} socket={socket} label="英雄牌堆" backImage={`${BASE_URL}%E5%8D%A1%E8%83%8C_%E8%8B%B1%E9%9B%84lv1.png`} onContextMenu={handleDeckContextMenu} />
          )}
          
          {/* Discard Pile */}
          <DeckNode x={450} y={100} type="discard_action" count={gameState.discardPiles.action.length} socket={socket} label="弃牌堆" onContextMenu={handleDeckContextMenu} />

          {/* Hand Size Display */}
          {gameState.seats[0] && gameState.players[gameState.seats[0]] && (
            <Group x={0} y={450}>
              <Rect width={250} height={40} fill="rgba(0,0,0,0.5)" cornerRadius={20} x={-125} />
              <Text 
                text={`玩家 1 手牌: ${gameState.players[gameState.seats[0]].hand.length} | 英雄: ${gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - 550) < 100).length} | 王城血量: ${gameState.castleHP[0] || 0}`} 
                fill="white" 
                width={300} 
                align="center" 
                y={12} 
                fontSize={16} 
                fontStyle="bold" 
                x={-150}
              />
            </Group>
          )}
          {gameState.seats[1] && gameState.players[gameState.seats[1]] && (
            <Group x={0} y={-450}>
              <Rect width={250} height={40} fill="rgba(0,0,0,0.5)" cornerRadius={20} x={-125} />
              <Text 
                text={`玩家 2 手牌: ${gameState.players[gameState.seats[1]].hand.length} | 英雄: ${gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - -700) < 100).length} | 王城血量: ${gameState.castleHP[1] || 0}`} 
                fill="white" 
                width={300} 
                align="center" 
                y={12} 
                fontSize={16} 
                fontStyle="bold" 
                x={-150}
              />
            </Group>
          )}

          {gameState.tableCards.map(card => (
            <CardNode 
              key={card.id} 
              card={card} 
              socket={socket} 
              onContextMenu={handleCardContextMenu} 
              onZoom={setZoomedCard} 
              onClick={(id) => {
                if (gameState.phase === 'action_select_option' && isActivePlayer) {
                  socket.emit('select_target', id);
                }
              }}
              isSelected={gameState.selectedTargetId === card.id}
              lastEvolvedId={gameState.lastEvolvedId}
            />
          ))}

          {gameState.hireAreaCards.map(card => (
            <CardNode 
              key={card.id} 
              card={card} 
              socket={socket} 
              onContextMenu={handleCardContextMenu} 
              onZoom={setZoomedCard} 
              onClick={(id) => {
                if (gameState.phase === 'action_select_option' && isActivePlayer) {
                  socket.emit('select_target', id);
                }
              }}
              isSelected={gameState.selectedTargetId === card.id}
              lastEvolvedId={gameState.lastEvolvedId}
            />
          ))}
          
          {gameState.playAreaCards?.map(card => (
            <CardNode 
              key={card.id} 
              card={card} 
              socket={socket} 
              onContextMenu={handleCardContextMenu} 
              onZoom={setZoomedCard} 
              onClick={(id) => {
                if (gameState.phase === 'action_select_option' && isActivePlayer) {
                  socket.emit('select_target', id);
                }
              }}
              isSelected={gameState.selectedTargetId === card.id}
              lastEvolvedId={gameState.lastEvolvedId}
            />
          ))}
          
          {gameState.tokens.map(token => {
            const isSelected = gameState.selectedTokenId === token.id;
            const isMyToken = (() => {
              if (!token.boundToCardId) return false;
              const card = gameState.tableCards.find(c => c.id === token.boundToCardId);
              if (!card) return false;
              const isPlayer1 = gameState.seats[0] === playerId;
              const isPlayer2 = gameState.seats[1] === playerId;
              return (isPlayer1 && card.y > 0) || (isPlayer2 && card.y < 0);
            })();

            return (
              <TokenNode 
                key={token.id} 
                token={token} 
                socket={socket} 
                onClick={handleTokenClick}
                onHexClick={handleHexClick}
                isMyToken={isMyToken}
                isSelected={isSelected}
                draggable={!gameState.gameStarted || (!gameState.selectedOption && !gameState.selectedTokenId && isMyToken)}
                lastEvolvedId={gameState.lastEvolvedId}
              />
            );
          })}
          
          {gameState.counters.map(counter => (
            <CounterNode key={counter.id} counter={counter} socket={socket} />
          ))}

          <HistoryLogGroup logs={gameState.logs || []} isVisible={isHistoryVisible} position={historyPos} onDragEnd={setHistoryPos} />
        </Layer>
      </Stage>

      {/* Context Menu */}
      {menu && (
        <div 
          className="absolute bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[120px]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.type === 'hex' ? (
            <button 
              className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
              onClick={() => { 
                socket.emit('add_counter', { type: 'time', x: menu.targetX, y: menu.targetY, value: 0 }); 
                setMenu(null); 
              }}
            >
              添加时间指示物 (Add Time Counter)
            </button>
          ) : menu.type === 'deck' ? (
            <>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                onClick={() => { socket.emit('draw_card', menu.targetId); setMenu(null); }}
              >
                抽到手牌 (Draw to Hand)
              </button>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                onClick={() => { socket.emit('shuffle_deck', menu.targetId); setMenu(null); }}
              >
                洗牌 (Shuffle)
              </button>
            </>
          ) : (
            <>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                onClick={() => { socket.emit('flip_card', menu.targetId); setMenu(null); }}
              >
                反转 (Flip)
              </button>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                onClick={() => { socket.emit('take_card_to_hand', menu.targetId); setMenu(null); }}
              >
                加入手牌 (Take)
              </button>
              {(() => {
                const card = [...gameState.tableCards, ...gameState.hireAreaCards, ...(gameState.playAreaCards || [])].find(c => c.id === menu.targetId);
                if (card && card.type === 'hero' && card.level && card.level < 3) {
                  return (
                    <button 
                      className="w-full text-left px-4 py-2 text-sm text-amber-400 hover:bg-zinc-700 font-bold"
                      onClick={() => { socket.emit('evolve_hero', menu.targetId); setMenu(null); }}
                    >
                      进化 (Evolve)
                    </button>
                  );
                }
                return null;
              })()}
              {(() => {
                const isHireArea = gameState.hireAreaCards.some(c => c.id === menu.targetId);
                const isPlayer1 = gameState.seats[0] === playerId;
                const isPlayer2 = gameState.seats[1] === playerId;
                const isPlayer = isPlayer1 || isPlayer2;
                const playerIndex = isPlayer1 ? 0 : (isPlayer2 ? 1 : -1);
                
                const tokenY = playerIndex === 0 ? 311.7 : -311.7;
                const castleHasHero = gameState.tokens.some(t => Math.abs(t.x) < 10 && Math.abs(t.y - tokenY) < 10);
                const isMyTurn = playerIndex === gameState.activePlayerIndex;
                const isCorrectPhase = ['shop', 'action_select_option'].includes(gameState.phase);

                if (isHireArea && isPlayer && !castleHasHero && isMyTurn && isCorrectPhase) {
                  return (
                    <button 
                      className="w-full text-left px-4 py-2 text-sm text-emerald-400 hover:bg-zinc-700 font-bold"
                      onClick={() => { setHirePopup({ cardId: menu.targetId }); setMenu(null); }}
                    >
                      雇佣 (Hire)
                    </button>
                  );
                }
                return null;
              })()}
            </>
          )}
        </div>
      )}

      {/* Hire Popup */}
      {hirePopup && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[300] pointer-events-auto backdrop-blur-sm" onClick={() => setHirePopup(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-2">花费多少金币雇佣？</h3>
            <div className="grid grid-cols-4 gap-3 w-full">
              {[2, 3, 4, 5, 6, 7, 8, 9].map(amount => (
                <button
                  key={amount}
                  className="bg-zinc-800 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg border border-zinc-700 hover:border-emerald-500 transition-colors"
                  onClick={() => {
                    socket.emit('hire_hero', { cardId: hirePopup.cardId, goldAmount: amount });
                    setHirePopup(null);
                  }}
                >
                  {amount}
                </button>
              ))}
            </div>
            <button 
              className="mt-4 text-zinc-400 hover:text-white text-sm"
              onClick={() => setHirePopup(null)}
            >
              取消 (Cancel)
            </button>
          </div>
        </div>
      )}

      {/* Zoom Controls Overlay */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-auto">
        <button onClick={zoomIn} className="w-10 h-10 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm border border-zinc-700 transition-colors">
          <ZoomIn size={20} />
        </button>
        <button onClick={resetZoom} className="w-10 h-10 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm border border-zinc-700 transition-colors" title="Reset View">
          <Maximize size={18} />
        </button>
        <button onClick={zoomOut} className="w-10 h-10 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm border border-zinc-700 transition-colors">
          <ZoomOut size={20} />
        </button>
      </div>

      {/* Explosion Effect Overlay */}
      <AnimatePresence>
        {showExplosion && (
          <div 
            className="absolute z-[1000] pointer-events-none"
            style={{ 
              left: (showExplosion.x * stageScale + stagePos.x), 
              top: (showExplosion.y * stageScale + stagePos.y),
              transform: 'translate(-50%, -50%)'
            }}
          >
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1.2, 2.5], 
                opacity: [0, 1, 0],
                rotate: [0, 45, 90]
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="w-32 h-32 flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-yellow-400 rounded-full blur-xl opacity-50" />
              <div className="absolute inset-4 bg-orange-500 rounded-full blur-lg opacity-70" />
              <div className="absolute inset-8 bg-white rounded-full blur-md" />
              
              {/* Particle sparks */}
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ 
                    x: Math.cos(i * 45 * Math.PI / 180) * 100,
                    y: Math.sin(i * 45 * Math.PI / 180) * 100,
                    opacity: 0,
                    scale: 0
                  }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="absolute w-2 h-2 bg-yellow-200 rounded-full"
                />
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
