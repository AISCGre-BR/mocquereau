import { useState } from "react";
import { ScrollText } from "lucide-react";

/**
 * Miniatura de um projeto recente. Sem miniatura (ou se ela não carregar), um
 * marcador discreto no mesmo espaço: ícone de manuscrito sobre o pergaminho fundo.
 */
export function RecentThumb({ src, className, iconClassName }: { src?: string; className: string; iconClassName: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && src !== failedSrc) {
    return <img src={src} alt="" className={`block object-cover ${className}`} onError={() => setFailedSrc(src)} />;
  }
  return (
    <div data-testid="recent-thumb-placeholder" className={`flex items-center justify-center bg-parchment-deep shadow-inset ${className}`}>
      <ScrollText aria-hidden="true" strokeWidth={1.75} className={`text-ink-muted ${iconClassName}`} />
    </div>
  );
}
