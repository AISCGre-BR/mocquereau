// SPDX-License-Identifier: GPL-3.0-or-later
// Protocolo de mensagens entre o renderer e o worker de deteccao.
import type { SuggestInput, SuggestResult } from './types';

/** Marca todas as mensagens; o teste de build procura esta string no chunk do worker. */
export const PROTOCOL = 'mocquereau.neume-detect.v1';

export type WorkerRequest =
  | { protocol: typeof PROTOCOL; type: 'suggest'; id: number; input: SuggestInput }
  | { protocol: typeof PROTOCOL; type: 'cancel'; id: number };

export type WorkerResponse =
  | { protocol: typeof PROTOCOL; type: 'result'; id: number; result: SuggestResult }
  | { protocol: typeof PROTOCOL; type: 'error'; id: number; message: string }
  | { protocol: typeof PROTOCOL; type: 'cancelled'; id: number };
