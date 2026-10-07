import { TablePreview } from "../components/TablePreview";

export interface TabelaViewProps {
  /** "Editar em Recortes" no menu de contexto da célula (deep link com sílaba: onda B). */
  onNavigateToEditor: (sourceId: string) => void;
}

/** Vista Tabela: prévia da tabela comparativa; ação principal Exportar DOCX… na toolbar. */
export function TabelaView({ onNavigateToEditor }: TabelaViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TablePreview onNavigateToEditor={onNavigateToEditor} />
    </div>
  );
}
