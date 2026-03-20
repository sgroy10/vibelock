import { memo } from 'react';
import { classNames } from '~/utils/classNames';

interface PanelHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export const PanelHeader = memo(({ className, children }: PanelHeaderProps) => {
  return (
    <div
      className={classNames(
        'flex items-center gap-2 bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary border-b border-bolt-elements-borderColor px-3 py-1 min-h-[36px] text-xs',
        className,
      )}
    >
      {children}
    </div>
  );
});
