import React from 'react';

const EXAMPLE_PROMPTS = [
  {
    text: 'Build a SaaS landing page with auth',
    icon: 'i-ph:rocket-launch',
    label: 'SaaS Landing',
  },
  {
    text: 'Create a beautiful dashboard with charts',
    icon: 'i-ph:chart-line-up',
    label: 'Dashboard',
  },
  {
    text: 'Build a recipe app — हिंदी में interface बनाओ',
    icon: 'i-ph:cooking-pot',
    label: 'Multilingual App',
  },
  {
    text: 'Crea una app de tareas con tema oscuro',
    icon: 'i-ph:check-circle',
    label: 'Task App',
  },
  {
    text: 'Build an e-commerce store with product cards',
    icon: 'i-ph:storefront',
    label: 'E-Commerce',
  },
  {
    text: 'Create a personal portfolio with animations',
    icon: 'i-ph:user-circle',
    label: 'Portfolio',
  },
];

export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return (
    <div className="relative w-full max-w-2xl mx-auto mt-8 px-4">
      <p className="text-xs text-bolt-elements-textTertiary text-center mb-3 font-medium uppercase tracking-wider">
        Try a template
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {EXAMPLE_PROMPTS.map((prompt, index) => (
          <button
            key={index}
            onClick={(event) => sendMessage?.(event, prompt.text)}
            className="group relative flex flex-col items-start gap-2 p-3.5 rounded-xl
              bg-bolt-elements-background-depth-2/60 backdrop-blur-sm
              border border-bolt-elements-borderColor
              hover:border-[rgba(255,107,44,0.3)] hover:bg-bolt-elements-background-depth-2
              transition-all duration-200 text-left
              hover:shadow-[0_0_20px_rgba(255,107,44,0.06)]"
            style={{
              animation: `fadeSlideUp 0.3s ease-out ${index * 0.05}s both`,
            }}
          >
            <div className="flex items-center gap-2 w-full">
              <span
                className={`${prompt.icon} text-lg transition-colors duration-200`}
                style={{ color: 'rgba(255,107,44,0.6)' }}
              />
              <span className="text-xs font-medium text-bolt-elements-textPrimary truncate">{prompt.label}</span>
            </div>
            <span className="text-[11px] text-bolt-elements-textTertiary leading-relaxed line-clamp-2">
              {prompt.text}
            </span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
