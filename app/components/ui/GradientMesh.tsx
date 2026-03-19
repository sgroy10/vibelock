/**
 * Animated gradient mesh background — replaces BackgroundRays.
 * Uses CSS animations for smooth, GPU-accelerated blobs.
 */
export function GradientMesh() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 20% 50%, rgba(255,107,44,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(255,143,60,0.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(255,107,44,0.04) 0%, transparent 50%)',
        }}
      />

      {/* Animated blobs */}
      <div
        className="absolute rounded-full"
        style={{
          width: '600px',
          height: '600px',
          top: '-10%',
          left: '-5%',
          background: 'radial-gradient(circle, rgba(255,107,44,0.12) 0%, transparent 70%)',
          filter: 'blur(80px)',
          animation: 'meshFloat1 20s ease-in-out infinite',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '500px',
          height: '500px',
          top: '20%',
          right: '-10%',
          background: 'radial-gradient(circle, rgba(255,143,60,0.10) 0%, transparent 70%)',
          filter: 'blur(60px)',
          animation: 'meshFloat2 25s ease-in-out infinite',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '400px',
          height: '400px',
          bottom: '-5%',
          left: '30%',
          background: 'radial-gradient(circle, rgba(255,107,44,0.08) 0%, transparent 70%)',
          filter: 'blur(70px)',
          animation: 'meshFloat3 18s ease-in-out infinite',
        }}
      />

      {/* Noise texture overlay for depth */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <style>{`
        @keyframes meshFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, 30px) scale(1.05); }
          66% { transform: translate(-20px, 50px) scale(0.95); }
        }
        @keyframes meshFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-30px, 40px) scale(1.08); }
          66% { transform: translate(20px, -30px) scale(0.92); }
        }
        @keyframes meshFloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -20px) scale(1.1); }
        }
      `}</style>
    </div>
  );
}
