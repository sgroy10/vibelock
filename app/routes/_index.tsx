import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { GradientMesh } from '~/components/ui/GradientMesh';

export const meta: MetaFunction = () => {
  return [
    { title: 'VibeLock — Build apps with confidence' },
    {
      name: 'description',
      content:
        'Describe what you want, in any language. VibeLock builds it live with AI — protected by SpecLock constraints.',
    },
    { property: 'og:title', content: 'VibeLock — Build apps with confidence' },
    {
      property: 'og:description',
      content: 'The reliability-first AI coding platform. Multilingual. Constraint-protected. Beautiful by default.',
    },
  ];
};

export const loader = () => json({});

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <GradientMesh />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}
