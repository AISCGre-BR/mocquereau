interface ScreenProps {
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

export function TablePreview({ onNext, onPrev, canGoNext, canGoPrev }: ScreenProps) {
  return (
    <div className="flex flex-col h-full p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Tabela Comparativa</h1>
      <p className="text-gray-500 mb-8">Tela 4 de 5 — Visualização completa da tabela (Fase 6)</p>
      <div className="flex-1" />
      <div className="flex justify-between">
        <button
          onClick={onPrev}
          disabled={!canGoPrev}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-40 hover:bg-gray-300"
        >
          Anterior
        </button>
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-700"
        >
          Próximo
        </button>
      </div>
    </div>
  );
}
