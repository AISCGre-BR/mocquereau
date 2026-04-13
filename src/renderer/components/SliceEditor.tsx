interface ScreenProps {
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

export function SliceEditor({ onNext, onPrev, canGoNext, canGoPrev }: ScreenProps) {
  return (
    <div className="flex flex-col h-full p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Editor de Recorte</h1>
      <p className="text-gray-500 mb-8">Tela 3 de 5 — Divisores arrastáveis e preview de fatias (Fase 4)</p>
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
