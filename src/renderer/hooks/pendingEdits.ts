// Edições pendentes das vistas (onda A1).
//
// Texto e Recortes guardam cópias locais com debounce de 300 ms antes de
// despachar para o projeto. Ações que leem ou trocam o documento (Novo, Abrir,
// Fechar, Salvar, Desfazer) precisam antes gravar essas pendências; e o flush
// que cada vista faz ao desmontar não pode vazar para o projeto seguinte.
//
// - register(flush): a vista registra uma função que despacha o que estiver
//   pendente e devolve true se despachou algo.
// - flushAll(): grava todas as pendências (chamar dentro de flushSync para ler o
//   estado já atualizado em seguida).
// - epoch()/bump(): muda sempre que o documento sob as vistas é trocado (novo,
//   aberto, fechado, desfeito). O flush ao desmontar é ignorado se a época mudou.
//
// Na onda B (spec D6) as vistas passam a editar o projeto direto e isto some.
import { useEffect, useRef } from "react";
import { useProject } from "./useProject";

export type PendingFlush = () => boolean;

export interface PendingEdits {
  register(flush: PendingFlush): () => void;
  flushAll(): boolean;
  epoch(): number;
  bump(): void;
}

export function createPendingEdits(): PendingEdits {
  const flushes = new Set<PendingFlush>();
  let epoch = 0;
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
