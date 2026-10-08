// Edições pendentes das vistas (onda A1).
//
// O Texto guarda cópias locais com debounce de 300 ms antes de despachar para
// o projeto (a Recortes grava direto no projeto no fim de cada gesto, spec D6). Ações que leem ou trocam o documento (Novo, Abrir,
// Fechar, Salvar, Desfazer) precisam antes gravar essas pendências; e o flush
// que cada vista faz ao desmontar não pode vazar para o projeto seguinte.
//
// - register(flush): a vista registra uma função que despacha o que estiver
//   pendente e devolve true se despachou algo.
// - flushAll(): grava todas as pendências (chamar dentro de flushSync para ler o
//   estado já atualizado em seguida).
// - markPending(): a vista armou um debounce. Avisa o main (setDirty(true)) na
//   hora, uma vez por ciclo, para fechar a janela nesses 300 ms ainda perguntar.
//   settle() encerra o ciclo; quem chama é o efeito que reporta o estado sujo real.
// - epoch()/bump(): muda sempre que o documento sob as vistas é trocado (novo,
//   aberto, fechado, desfeito). O flush ao desmontar é ignorado se a época mudou.
//
// Quando o Texto também editar o projeto direto, isto some.
import { useEffect, useRef } from "react";
import { useProject } from "./useProject";

export type PendingFlush = () => boolean;

export interface PendingEdits {
  register(flush: PendingFlush): () => void;
  flushAll(): boolean;
  markPending(): void;
  settle(): void;
  epoch(): number;
  bump(): void;
}

export function createPendingEdits(): PendingEdits {
  const flushes = new Set<PendingFlush>();
  let epoch = 0;
  let marked = false;
  return {
    register(flush) {
      flushes.add(flush);
      return () => {
        flushes.delete(flush);
      };
    },
    flushAll() {
      let any = false;
      for (const flush of [...flushes]) any = flush() || any;
      return any;
    },
    markPending() {
      if (marked) return;
      marked = true;
      void window.mocquereau?.setDirty?.(true);
    },
    settle() {
      marked = false;
    },
    epoch: () => epoch,
    bump() {
      epoch += 1;
    },
  };
}

/**
 * Registra o flush da vista e o executa ao desmontar, a menos que o documento
 * tenha sido trocado desde a montagem (época diferente). Sem registro no
 * contexto (testes isolados), só executa o flush ao desmontar.
 */
export function usePendingFlush(flush: PendingFlush): void {
  const { pending } = useProject();
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    const mountEpoch = pending?.epoch();
    const run = () => flushRef.current();
    const unregister = pending?.register(run);
    return () => {
      unregister?.();
      if (pending && pending.epoch() !== mountEpoch) return;
      run();
    };
  }, [pending]);
}
