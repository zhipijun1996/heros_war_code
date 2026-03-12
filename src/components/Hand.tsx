import { useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Card, GameState } from '../types';
import { motion } from 'motion/react';

interface HandProps {
  socket: Socket;
  hand: Card[];
  setZoomedCard: (card: Card | null) => void;
  gameState: GameState;
}

export default function Hand({ socket, hand, setZoomedCard, gameState }: HandProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const playCard = (cardId: string) => {
    if (gameState.phase === 'discard') {
      socket.emit('error_message', '弃牌阶段无法出牌。');
      return;
    }
    // Play card to the center of the map (0,0)
    socket.emit('play_card', { cardId, x: 0, y: 0 });
  };

  const handleCardClick = (cardId: string) => {
    if (gameState.phase === 'discard') {
      socket.emit('discard_card', cardId);
      return;
    }
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    clickTimeoutRef.current = setTimeout(() => {
      playCard(cardId);
      clickTimeoutRef.current = null;
    }, 250);
  };

  const handleCardDoubleClick = (e: React.MouseEvent, card: Card) => {
    e.stopPropagation();
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setZoomedCard(card);
  };

  return (
    <div className="flex justify-center items-end pb-4 h-48 pointer-events-none">
      <div className="flex gap-[-20px] pointer-events-auto">
        {hand && hand.map((card, index) => {
          const isHovered = hoveredIndex === index;
          
          return (
            <motion.div
              key={card.id}
              className="relative w-24 h-36 rounded-lg shadow-xl cursor-pointer border border-zinc-700 bg-zinc-800 overflow-hidden"
              style={{
                marginLeft: index === 0 ? 0 : -30,
                zIndex: isHovered ? 10 : index,
              }}
              initial={{ y: 50, opacity: 0 }}
              animate={{ 
                y: isHovered ? -20 : 0, 
                opacity: 1,
                rotate: isHovered ? 0 : (index - hand.length / 2) * 2
              }}
              onHoverStart={() => setHoveredIndex(index)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => handleCardClick(card.id)}
              onDoubleClick={(e) => handleCardDoubleClick(e, card)}
            >
              <img 
                src={card.frontImage} 
                alt="Card Front" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
