import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { X } from 'lucide-react';
import { GameLog } from '../types';

interface LogWindowProps {
  logs: GameLog[];
  onClose: () => void;
}

export default function LogWindow({ logs, onClose }: LogWindowProps) {
  const displayLogs = logs.slice(-18);
  const nodeRef = useRef(null);
  return (
    <Draggable nodeRef={nodeRef} handle=".handle">
      <div ref={nodeRef} className="absolute top-20 left-20 w-80 h-96 bg-zinc-900/90 border border-zinc-700 rounded-xl shadow-2xl backdrop-blur-sm z-[200] flex flex-col">
        <div className="handle flex justify-between items-center px-4 py-2 bg-zinc-800/80 rounded-t-xl cursor-move">
          <span className="text-zinc-300 font-bold text-sm">历史记录 (History)</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {displayLogs.map((log) => (
            <div key={log.id} className="flex gap-2 text-sm">
              <span className="text-zinc-500 font-bold">[{log.round}]</span>
              <span className={log.playerIndex === 0 ? 'text-blue-400' : log.playerIndex === 1 ? 'text-red-400' : 'text-zinc-300'}>
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Draggable>
  );
}
