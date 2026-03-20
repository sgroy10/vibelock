import { useStore } from '@nanostores/react';
import { computed } from 'nanostores';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { streamingState } from '~/lib/stores/streaming';
import { workbenchStore } from '~/lib/stores/workbench';
import { devMode } from '~/lib/stores/devMode';

export function Header() {
  const chat = useStore(chatStore);
  const isStreaming = useStore(streamingState);
  const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));
  const isDevMode = useStore(devMode);

  const status = isStreaming ? 'building' : hasPreview ? 'ready' : null;

  return (
    <header
      className={classNames(
        'flex items-center justify-between px-4 h-[var(--header-height)] z-20 relative',
        'border-b border-bolt-elements-borderColor',
        'bg-bolt-elements-background-depth-1/90 backdrop-blur-lg',
      )}
    >
      {/* Left: Logo */}
      <a href="/" className="flex items-center gap-2 group shrink-0">
        <img
          src="/vibelock-logo.png"
          alt="VibeLock"
          style={{ width: '28px', height: '28px', objectFit: 'contain' }}
          className="transition-transform duration-200 group-hover:scale-105"
        />
        <span
          className="text-base font-semibold tracking-tight hidden sm:inline"
          style={{
            background: 'linear-gradient(135deg, #FF8F3C, #FF6B2C)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          VibeLock
        </span>
      </a>

      {/* Center: Project name + Status pill */}
      <div className="flex items-center gap-3 flex-1 justify-center min-w-0 px-4">
        {chat.started && (
          <>
            <span className="truncate text-sm text-bolt-elements-textSecondary max-w-[200px]">
              <ClientOnly>{() => <ChatDescription />}</ClientOnly>
            </span>
            {status && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
                style={{
                  background: status === 'building' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                  border: `1px solid ${status === 'building' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                  color: status === 'building' ? '#F59E0B' : '#22C55E',
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: status === 'building' ? '#F59E0B' : '#22C55E',
                    animation: status === 'building' ? 'vibelock-pulse 1.5s ease-in-out infinite' : 'none',
                  }}
                />
                {status === 'building' ? 'Building...' : 'Ready'}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: Dev toggle + action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        {chat.started && (
          <button
            onClick={() => devMode.set(!isDevMode)}
            className={classNames(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
              isDevMode
                ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
            )}
            title={isDevMode ? 'Switch to Preview mode' : 'Switch to Developer mode'}
          >
            <div className={isDevMode ? 'i-ph:code-bold text-sm' : 'i-ph:code text-sm'} />
            <span className="hidden sm:inline">Dev</span>
          </button>
        )}
        {chat.started ? (
          <ClientOnly>
            {() => (
              <div>
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        ) : (
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/sgroy10/vibelock"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-colors"
            >
              GitHub
            </a>
          </div>
        )}
      </div>

      <style>{`
        @keyframes vibelock-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </header>
  );
}
