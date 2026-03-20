import React, { useEffect, useState, useMemo } from 'react';
import type { Message } from 'ai';

interface BuildProgressProps {
  messages: Message[];
  isStreaming: boolean;
}

interface Phase {
  label: string;
  icon: string;
  done: boolean;
}

const FRIENDLY_MESSAGES = [
  'Setting things up for you...',
  'Designing your layout...',
  'Making it look beautiful...',
  'Adding the interactive parts...',
  'Putting it all together...',
  'Almost there — final touches!',
];

function getPhases(content: string, isStreaming: boolean): Phase[] {
  const hasFiles = content.includes('filePath="');
  const hasConfig = content.includes('package.json') || content.includes('tsconfig');
  const hasStyles = /\.(css|scss|sass)/.test(content);
  const hasInstall = content.includes('npm install') || content.includes('npm i ');
  const hasDevServer = content.includes('npm run dev') || content.includes('npm start');
  const fileCount = (content.match(/filePath="/g) || []).length;

  const phases: Phase[] = [
    {
      label: 'Setting things up',
      icon: 'i-ph:magic-wand',
      done: hasConfig || hasFiles,
    },
    {
      label: 'Designing your app',
      icon: 'i-ph:paint-brush',
      done: hasStyles || fileCount > 3,
    },
    {
      label: 'Making it interactive',
      icon: 'i-ph:cursor-click',
      done: hasInstall,
    },
    {
      label: 'Starting your app',
      icon: 'i-ph:rocket-launch',
      done: hasDevServer && !isStreaming,
    },
  ];

  return phases;
}

export const BuildProgress: React.FC<BuildProgressProps> = ({ messages, isStreaming }) => {
  const [currentMessage, setCurrentMessage] = useState(0);

  useEffect(() => {
    if (!isStreaming) {
      return undefined;
    }

    const interval = setInterval(() => {
      setCurrentMessage((i) => (i + 1) % FRIENDLY_MESSAGES.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isStreaming]);

  const lastAssistantContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && typeof messages[i].content === 'string') {
        return messages[i].content as string;
      }
    }

    return '';
  }, [messages]);

  const phases = useMemo(() => getPhases(lastAssistantContent, isStreaming), [lastAssistantContent, isStreaming]);

  const doneCount = phases.filter((p) => p.done).length;
  const progress = (doneCount / phases.length) * 100;

  if (!isStreaming && doneCount === 0) {
    return null;
  }

  const isComplete = !isStreaming && doneCount === phases.length;

  return (
    <div
      className="flex items-center justify-center pointer-events-none"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        transition: 'opacity 0.5s ease',
        opacity: isComplete ? 0 : 1,
      }}
    >
      <div
        className="w-[400px] rounded-2xl p-6 pointer-events-auto"
        style={{
          background: 'rgba(13, 13, 15, 0.88)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid rgba(255, 107, 44, 0.12)',
          boxShadow: '0 0 80px rgba(255, 107, 44, 0.06), 0 32px 64px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255, 107, 44, 0.12)' }}
          >
            <div className="i-ph:sparkle text-xl" style={{ color: '#FF6B2C' }} />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: '#FAFAFA' }}>
              VibeLock is building
            </div>
            <div
              className="text-xs mt-0.5 transition-opacity duration-500"
              style={{ color: '#71717A' }}
              key={currentMessage}
            >
              {FRIENDLY_MESSAGES[currentMessage]}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 rounded-full mb-5 overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.04)' }}>
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${Math.max(progress, isStreaming ? 12 : 0)}%`,
              background: 'linear-gradient(90deg, #FF6B2C, #FF8F3C)',
              boxShadow: '0 0 12px rgba(255, 107, 44, 0.4)',
            }}
          />
        </div>

        {/* Phases */}
        <div className="flex flex-col gap-3">
          {phases.map((phase, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                {phase.done ? (
                  <div className="i-ph:check-circle-fill text-lg" style={{ color: '#22C55E' }} />
                ) : i === doneCount && isStreaming ? (
                  <div className="i-svg-spinners:90-ring-with-bg text-lg" style={{ color: '#FF6B2C' }} />
                ) : (
                  <div className={`${phase.icon} text-base`} style={{ color: '#27272A' }} />
                )}
              </div>
              <span
                className="text-sm"
                style={{
                  color: phase.done ? '#E4E4E7' : i === doneCount && isStreaming ? '#A1A1AA' : '#27272A',
                  transition: 'color 0.3s ease',
                }}
              >
                {phase.label}
              </span>
            </div>
          ))}
        </div>

        {/* App ready celebration */}
        {!isStreaming && doneCount === phases.length && (
          <div
            className="mt-5 rounded-xl px-4 py-3 flex items-center gap-3"
            style={{
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.15)',
              animation: 'vibelock-celebrate 0.5s ease-out',
            }}
          >
            <div className="i-ph:check-circle-fill text-xl" style={{ color: '#22C55E' }} />
            <div>
              <span className="text-sm font-medium" style={{ color: '#22C55E' }}>
                Your app is ready!
              </span>
              <span className="text-xs block mt-0.5" style={{ color: '#71717A' }}>
                Check the preview above
              </span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes vibelock-celebrate {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};
