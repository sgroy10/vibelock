import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames(
        'flex items-center justify-between px-5 h-[var(--header-height)] z-20 relative',
        'backdrop-blur-md',
        {
          'border-b-0': !chat.started,
          'border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1/80': chat.started,
        },
      )}
    >
      {/* Logo */}
      <a href="/" className="flex items-center gap-2.5 group">
        <img
          src="/vibelock-logo.png"
          alt="VibeLock"
          style={{ width: '32px', height: '32px', objectFit: 'contain' }}
          className="transition-transform duration-200 group-hover:scale-105"
        />
        <span
          className="text-lg font-semibold tracking-tight"
          style={{
            background: 'linear-gradient(135deg, #FF8F3C, #FF6B2C)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          VibeLock
        </span>
      </a>

      {/* Center — Chat description (when active) */}
      {chat.started && (
        <span className="flex-1 px-4 truncate text-center text-sm text-bolt-elements-textSecondary">
          <ClientOnly>{() => <ChatDescription />}</ClientOnly>
        </span>
      )}

      {/* Right — Action buttons or nav links */}
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
    </header>
  );
}
