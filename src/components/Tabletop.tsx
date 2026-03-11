import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Line } from 'react-konva';
import useImage from 'use-image';
import { Socket } from 'socket.io-client';
import { GameState, TableCard, Token, Counter, Card } from '../types';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface TabletopProps {
  socket: Socket;
  gameState: GameState;
  setZoomedCard: (card: Card | null) => void;
  playerId: string;
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

function HexNode({ q, r, x, y, fill, icon, onContextMenu }: any) {
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
      <Line points={points} fill={fill} stroke="#a1a1aa" strokeWidth={1} closed />
      {icon && <Text x={x - HEX_SIZE/2} y={y - 12} width={HEX_SIZE} text={icon} fontSize={24} align="center" />}
    </Group>
  );
}

function HexGridLayer({ onHexContextMenu }: { onHexContextMenu: (e: any, x: number, y: number, clientX?: number, clientY?: number) => void }) {
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
      
      hexes.push(
        <HexNode key={`${q}-${r}`} q={q} r={r} x={x} y={y} fill={fill} icon={icon} onContextMenu={onHexContextMenu} />
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

function TokenNode({ token, socket }: { token: Token; socket: Socket }) {
  const [image] = useImage(token.image);
  
  return (
    <Group
      x={token.x}
      y={token.y}
      draggable
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
      <Circle radius={30} fill="#27272a" stroke="#52525b" strokeWidth={2} shadowColor="black" shadowBlur={10} shadowOpacity={0.5} shadowOffset={{ x: 2, y: 2 }} />
      {image && (
        <Circle radius={28} fillPatternImage={image} fillPatternScale={{ x: 56 / image.width, y: 56 / image.height }} fillPatternOffset={{ x: image.width / 2, y: image.height / 2 }} />
      )}
      {token.label && (
        <Text text={token.label} fill="white" y={35} x={-40} width={80} align="center" fontSize={12} fontStyle="bold" shadowColor="black" shadowBlur={2} />
      )}
    </Group>
  );
}

function CardNode({ card, socket, onContextMenu, onZoom }: { card: TableCard; socket: Socket, onContextMenu: (e: any, id: string) => void, onZoom: (card: TableCard) => void }) {
  const [frontImage] = useImage(card.frontImage);
  const [backImage] = useImage(card.backImage);
  
  const image = card.faceUp ? frontImage : backImage;

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
  };

  const handleClick = (e: any) => {
    if (longPressTriggered.current) {
      e.cancelBubble = true;
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
      draggable
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
        shadowColor="black"
        shadowBlur={10}
        shadowOpacity={0.5}
        shadowOffset={{ x: 2, y: 2 }}
        stroke="#3f3f46"
        strokeWidth={1}
      />
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

export default function Tabletop({ socket, gameState, setZoomedCard, playerId }: TabletopProps) {
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  return (
    <div ref={containerRef} className="w-full h-full bg-[#1e1e24] relative touch-none" onContextMenu={(e) => e.preventDefault()}>
      {errorMsg && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl z-[300] font-bold animate-bounce pointer-events-none">
          {errorMsg}
        </div>
      )}

      {/* Start Game Overlay */}
      {!gameState.gameStarted && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[200] pointer-events-auto backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-6">
            <h2 className="text-2xl font-bold text-white text-center">欢迎进行勇者之争桌游1.0测试</h2>
            
            <div className="w-full flex flex-col gap-3">
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
                      <button 
                        onClick={() => socket.emit('sit_down', seatIndex)}
                        className="px-4 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors"
                      >
                        坐下 (Sit)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button 
              onClick={() => socket.emit('start_game')}
              className="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-lg font-bold shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all"
            >
              确定 (Start Game)
            </button>
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
        <HexGridLayer onHexContextMenu={handleHexContextMenu} />
        
        <Layer>
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

          {/* End Turn Button */}
          <Group 
            x={450} 
            y={265} 
            onClick={(e) => { e.cancelBubble = true; socket.emit('end_turn'); }}
            onTap={(e) => { e.cancelBubble = true; socket.emit('end_turn'); }}
          >
            <Rect width={100} height={30} fill="#4f46e5" cornerRadius={5} shadowColor="black" shadowBlur={5} shadowOpacity={0.3} />
            <Text text="回合结束" fill="white" width={100} align="center" y={8} fontSize={14} fontStyle="bold" />
          </Group>

          {/* Hand Size Display */}
          {gameState.seats[0] && gameState.players[gameState.seats[0]] && (
            <Group x={0} y={450}>
              <Rect width={250} height={40} fill="rgba(0,0,0,0.5)" cornerRadius={20} x={-125} />
              <Text 
                text={`玩家 1 手牌: ${gameState.players[gameState.seats[0]].hand.length} | 英雄: ${gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - 550) < 100).length}`} 
                fill="white" 
                width={250} 
                align="center" 
                y={12} 
                fontSize={16} 
                fontStyle="bold" 
                x={-125}
              />
            </Group>
          )}
          {gameState.seats[1] && gameState.players[gameState.seats[1]] && (
            <Group x={0} y={-450}>
              <Rect width={250} height={40} fill="rgba(0,0,0,0.5)" cornerRadius={20} x={-125} />
              <Text 
                text={`玩家 2 手牌: ${gameState.players[gameState.seats[1]].hand.length} | 英雄: ${gameState.tableCards.filter(c => c.type === 'hero' && Math.abs(c.y - -700) < 100).length}`} 
                fill="white" 
                width={250} 
                align="center" 
                y={12} 
                fontSize={16} 
                fontStyle="bold" 
                x={-125}
              />
            </Group>
          )}

          {gameState.tableCards.map(card => (
            <CardNode key={card.id} card={card} socket={socket} onContextMenu={handleCardContextMenu} onZoom={setZoomedCard} />
          ))}

          {gameState.hireAreaCards.map(card => (
            <CardNode key={card.id} card={card} socket={socket} onContextMenu={handleCardContextMenu} onZoom={setZoomedCard} />
          ))}
          
          {gameState.playAreaCards?.map(card => (
            <CardNode key={card.id} card={card} socket={socket} onContextMenu={handleCardContextMenu} onZoom={setZoomedCard} />
          ))}
          
          {gameState.tokens.map(token => (
            <TokenNode key={token.id} token={token} socket={socket} />
          ))}
          
          {gameState.counters.map(counter => (
            <CounterNode key={counter.id} counter={counter} socket={socket} />
          ))}
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
                const isPlayer = gameState.seats[0] === playerId || gameState.seats[1] === playerId;
                if (isHireArea && isPlayer) {
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
    </div>
  );
}
