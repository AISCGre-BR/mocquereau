import { TablePreview } from "../components/TablePreview";

export interface TabelaViewProps {
  /** "Editar em Recortes" no menu de contexto da célula e clique na célula vazia: abrem Recortes na fonte e sílaba. */
  onNavigateToEditor: (sourceId: string, syllable: number) => void;
}

/** Vista Tabela: prévia da tabela comparativa; ação principal Exportar DOCX… na toolbar. */
export function TabelaView({ onNavigateToEditor }: TabelaViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TablePreview onNavigateToEditor={onNavigateToEditor} />
    </div>
  );
}
