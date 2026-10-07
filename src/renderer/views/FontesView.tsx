import { SourceList } from "../components/SourceList";

/** Vista Fontes: manuscritos (linhas da tabela) e suas imagens. */
export function FontesView() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <SourceList />
    </div>
  );
}
