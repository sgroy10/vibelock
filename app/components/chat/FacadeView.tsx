import React, { useEffect, useState, useMemo } from 'react';
import type { Message } from 'ai';
import { classNames } from '~/utils/classNames';

interface FacadeViewProps {
  messages: Message[];
  isStreaming: boolean;
  className?: string;
}

interface ProgressStep {
  icon: string;
  label: string;
  status: 'pending' | 'active' | 'done';
}

const TRIVIA = [
  'The first website ever created is still online at info.cern.ch',
  'JavaScript was created in just 10 days by Brendan Eich',
  'The term "bug" came from an actual moth found in a computer in 1947',
  'Over 1.8 billion websites exist, but only ~200 million are active',
  'The average web page is now over 2MB — heavier than the original Doom game',
  "React was first deployed on Facebook's News Feed in 2011",
  'TypeScript was released by Microsoft in 2012 and is now used in 78% of large projects',
  "Node.js runs on Chrome's V8 engine — the same engine powering billions of browsers",
  'The first programmer was Ada Lovelace, who wrote code in the 1840s',
  "CSS Grid was proposed in 2011 but didn't get full browser support until 2017",
  'Tailwind CSS went from $0 revenue to $12M ARR in under 3 years',
  'The "cloud" is just someone else\'s computer — over 100 million servers worldwide',
];

function getRandomTrivia(): string {
  return TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
}

function parseStepsFromContent(content: string): ProgressStep[] {
  const steps: ProgressStep[] = [];

  // Detect file creation
  const fileMatches = content.match(/filePath="([^"]+)"/g) || [];
  const uniqueFiles = new Set(fileMatches.map((m) => m.replace('filePath="', '').replace('"', '')));

  if (uniqueFiles.size > 0) {
    const fileTypes = new Set<string>();

    for (const f of uniqueFiles) {
      if (f.includes('package.json')) {
        fileTypes.add('config');
      }

      if (f.match(/\.(tsx?|jsx?)$/)) {
        fileTypes.add('components');
      }

      if (f.match(/\.(css|scss|sass)$/)) {
        fileTypes.add('styles');
      }

      if (f.match(/\.(html)$/)) {
        fileTypes.add('pages');
      }
    }

    if (fileTypes.has('config')) {
      steps.push({ icon: 'i-ph:gear', label: 'Setting up project configuration', status: 'done' });
    }

    if (fileTypes.has('components')) {
      steps.push({
        icon: 'i-ph:code',
        label: `Creating ${uniqueFiles.size} files for your app`,
        status: 'done',
      });
    }

    if (fileTypes.has('styles')) {
      steps.push({ icon: 'i-ph:paint-brush', label: 'Designing the look and feel', status: 'done' });
    }
  }

  // Detect npm install
  if (content.includes('npm install') || content.includes('npm i ')) {
    steps.push({ icon: 'i-ph:package', label: 'Installing dependencies', status: 'done' });
  }

  // Detect dev server
  if (content.includes('npm run dev') || content.includes('npm start')) {
    steps.push({ icon: 'i-ph:rocket-launch', label: 'Starting your app', status: 'done' });
  }

  return steps;
}

export const FacadeView: React.FC<FacadeViewProps> = ({ messages, isStreaming, className }) => {
  const [trivia, setTrivia] = useState(getRandomTrivia());

  // Rotate trivia every 6 seconds while streaming
  useEffect(() => {
    if (!isStreaming) {
      return undefined;
    }

    let index = 0;

    const interval = setInterval(() => {
      index = (index + 1) % TRIVIA.length;
      setTrivia(TRIVIA[index]);
    }, 6000);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Get the last assistant message content for progress parsing
  const lastAssistantContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        const content = messages[i].content;

        if (typeof content === 'string') {
          return content;
        }
      }
    }

    return '';
  }, [messages]);

  const steps = useMemo(() => parseStepsFromContent(lastAssistantContent), [lastAssistantContent]);

  // Extract clean text summary from the AI response (non-code parts)
  const friendlyMessage = useMemo(() => {
    if (!lastAssistantContent) {
      return '';
    }

    // Strip XML tags to get the natural language part
    const cleaned = lastAssistantContent
      .replace(/<boltArtifact[^>]*>[\s\S]*?<\/boltArtifact>/g, '')
      .replace(/<boltAction[^>]*>[\s\S]*?<\/boltAction>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();

    // Take first 500 chars of clean text
    return cleaned.slice(0, 500);
  }, [lastAssistantContent]);

  return (
    <div className={classNames('flex flex-col w-full flex-1 max-w-chat pb-4 mx-auto z-1', className)}>
      {/* User messages displayed as simple bubbles */}
      {messages
        .filter((m) => m.role === 'user')
        .map((msg, i) => {
          const content = typeof msg.content === 'string' ? msg.content : '';

          // Strip model/provider prefix
          const cleanContent = content.replace(/^\[Model:.*?\]\n\n\[Provider:.*?\]\n\n/, '');

          return (
            <div key={msg.id || i} className="flex justify-end mb-4">
              <div
                className="max-w-[80%] rounded-2xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,107,44,0.12)', color: 'var(--bolt-elements-textPrimary)' }}
              >
                {cleanContent}
              </div>
            </div>
          );
        })}

      {/* AI response as friendly progress */}
      {(isStreaming || lastAssistantContent) && (
        <div className="flex justify-start mb-4">
          <div className="max-w-[90%] w-full">
            {/* Friendly text response */}
            {friendlyMessage && (
              <div
                className="rounded-2xl px-4 py-3 text-sm mb-3"
                style={{ background: 'var(--bolt-elements-bg-depth-3)', color: 'var(--bolt-elements-textPrimary)' }}
              >
                {friendlyMessage}
              </div>
            )}

            {/* Progress steps */}
            {steps.length > 0 && (
              <div
                className="rounded-2xl px-4 py-3 mb-3"
                style={{
                  background: 'var(--bolt-elements-bg-depth-2)',
                  border: '1px solid var(--bolt-elements-borderColor)',
                }}
              >
                <div className="text-xs font-medium mb-3" style={{ color: 'var(--bolt-elements-textTertiary)' }}>
                  {isStreaming ? 'VibeLock is building your app...' : "Here's what VibeLock built for you"}
                </div>
                <div className="flex flex-col gap-2">
                  {steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 flex items-center justify-center">
                        {step.status === 'done' ? (
                          <div className="i-ph:check-circle-fill text-lg" style={{ color: '#22C55E' }} />
                        ) : step.status === 'active' ? (
                          <div className="i-svg-spinners:90-ring-with-bg text-lg" style={{ color: '#FF6B2C' }} />
                        ) : (
                          <div
                            className={`${step.icon} text-lg`}
                            style={{ color: 'var(--bolt-elements-textTertiary)' }}
                          />
                        )}
                      </div>
                      <span
                        className="text-sm"
                        style={{
                          color:
                            step.status === 'done'
                              ? 'var(--bolt-elements-textPrimary)'
                              : 'var(--bolt-elements-textTertiary)',
                        }}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streaming indicator + trivia */}
            {isStreaming && (
              <div
                className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: 'rgba(255,107,44,0.06)', border: '1px solid rgba(255,107,44,0.12)' }}
              >
                <div className="flex gap-1">
                  <div
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: '#FF6B2C', animationDelay: '0ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: '#FF8F3C', animationDelay: '150ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: '#FFB070', animationDelay: '300ms' }}
                  />
                </div>
                <span className="text-xs" style={{ color: 'var(--bolt-elements-textTertiary)' }}>
                  {trivia}
                </span>
              </div>
            )}

            {/* App ready celebration — shown when streaming ends and we have steps */}
            {!isStreaming && steps.length > 0 && (
              <div
                className="rounded-2xl px-5 py-4 flex items-center gap-3 animate-fade-in"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                <div className="i-ph:rocket-launch text-2xl" style={{ color: '#22C55E' }} />
                <div className="flex flex-col">
                  <span className="text-sm font-medium" style={{ color: '#22C55E' }}>
                    Your app is ready!
                  </span>
                  <span className="text-xs" style={{ color: 'var(--bolt-elements-textTertiary)' }}>
                    Check the preview on the right. You can keep refining it.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
