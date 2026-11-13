// Effet au clic sur "Présent" (retour de Cindy du 13/11, "quand je clique
// sur présent, rien ne se passe") : petite gerbe de confettis autour du
// bouton + "C'est noté !" qui s'envole. Pur CSS (globals.css, ubac-particle
// / ubac-noted), aucune bibliothèque. À placer DANS le bouton (qui doit
// être `relative`) ; `burstKey` change à chaque clic, ce qui rejoue l'effet.
// Rien du tout si le téléphone demande moins d'animations.
const PARTICLES = [
  { dx: -26, dy: -22, color: "#22c55e" },
  { dx: 26, dy: -22, color: "#F4C430" },
  { dx: -34, dy: 2, color: "#F4C430" },
  { dx: 34, dy: 2, color: "#22c55e" },
  { dx: -18, dy: 22, color: "#203090" },
  { dx: 18, dy: 22, color: "#22c55e" },
  { dx: 0, dy: -30, color: "#22c55e" },
  { dx: -8, dy: 26, color: "#F4C430" },
  { dx: 30, dy: -10, color: "#203090" },
  { dx: -30, dy: -10, color: "#22c55e" },
];

export default function PresentBurst({ burstKey }: { burstKey: number }) {
  if (burstKey === 0) return null;
  return (
    <span key={burstKey} aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="animate-ubac-particle absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
          style={
            {
              backgroundColor: p.color,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
      <span className="animate-ubac-noted absolute -top-5 left-1/2 whitespace-nowrap rounded-full bg-status-success px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
        C&apos;est noté !
      </span>
    </span>
  );
}
