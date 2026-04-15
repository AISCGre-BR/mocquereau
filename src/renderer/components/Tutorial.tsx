// src/renderer/components/Tutorial.tsx
// First-run tutorial overlay. Shown once; dismissal persisted to app state.

import { useState, useEffect } from 'react';

interface Step {
  title: string;
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'Bem-vindo ao Mocquereau!',
    body: (
      <>
        <p>
          Esta ferramenta ajuda você a construir tabelas neumáticas comparativas
          a partir de manuscritos de canto gregoriano — substituindo o processo
          manual no Word.
        </p>
        <p className="mt-2 text-gray-600">
          O fluxo tem 5 etapas. Vamos caminhar por elas rapidamente.
        </p>
        <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded text-xs text-orange-900">
          <strong>⚠ Versão ALPHA — uso por sua conta e risco.</strong><br />
          O software é fornecido "no estado em que se encontra", sem garantias.
          Os autores não se responsabilizam por perda de dados, travamentos ou
          outros defeitos. Faça backup dos seus projetos regularmente.
        </div>
      </>
    ),
  },
  {
    title: '1. Texto & Projeto',
    body: (
      <>
        <p>
          Digite o texto litúrgico em latim. A silabificação automática aparece
          logo abaixo — você pode editar os hífens diretamente para ajustar.
        </p>
        <p className="mt-2 text-gray-600">
          Ao criar o projeto, você escolhe onde salvar. Ctrl+S salva depois.
        </p>
      </>
    ),
  },
  {
    title: '2. Fontes & Imagens',
    body: (
      <>
        <p>
          Adicione manuscritos como linhas da tabela. Preencha sigla, cidade,
          século, fólio — ou importe do Gueranger em lote.
        </p>
        <p className="mt-2 text-gray-600">
          Em cada linha, Ctrl+V cola a imagem do manuscrito do clipboard.
        </p>
      </>
    ),
  },
  {
    title: '3. Editor de Recorte',
    body: (
      <>
        <p>
          Clique numa sílaba no topo e arraste na imagem para demarcar a caixa
          daquele neuma. Tab avança para a próxima sílaba.
        </p>
        <p className="mt-2 text-gray-600">
          Cada caixa tem 8 alças (como no Word). Use "Mesmo tamanho da 1ª"
          para agilizar. Delete remove a caixa ativa.
        </p>
      </>
    ),
  },
  {
    title: '4. Tabela Comparativa',
    body: (
      <>
        <p>
          Veja a tabela pronta com todos os recortes. Passe o mouse numa célula
          para ampliar. Click abre menu para editar ou remover.
        </p>
      </>
    ),
  },
  {
    title: '5. Exportar DOCX',
    body: (
      <>
        <p>
          Gera um arquivo .docx em paisagem, com imagens embutidas, pronto para
          revisão ou publicação no Word.
        </p>
        <p className="mt-3 text-sm text-blue-700">
          Tudo pronto! Você pode rever este tutorial a qualquer momento no menu
          Ajuda &gt; Tutorial (próximas versões).
        </p>
      </>
    ),
  },
];

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  // Allow Escape to dismiss
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={[
                'w-2 h-2 rounded-full transition-colors',
                i === step ? 'bg-blue-600 w-6' : i < step ? 'bg-blue-300' : 'bg-gray-300',
              ].join(' ')}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-8 pt-6 pb-4">
          <h2 className="text-xl font-bold text-gray-900 mb-3">{current.title}</h2>
          <div className="text-sm text-gray-700 leading-relaxed">{current.body}</div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            Pular tutorial
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={isFirst}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40"
            >
              Anterior
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Começar!
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Próximo →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
