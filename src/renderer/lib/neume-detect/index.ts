// SPDX-License-Identifier: GPL-3.0-or-later
// API publica da deteccao de neumas (onda A3). A integracao no editor e da onda C.
export { suggestBoxes, MAX_LONG_SIDE, MIN_CONFIDENCE } from './pipeline';
export { createNeumeDetectClient, NeumeDetectCancelledError } from './client';
export type { NeumeDetectClient, NeumeDetectClientOptions, WorkerLike } from './client';
export type {
  BandDebug,
  BandSource,
  ChannelName,
  FracRect,
  GrayImage,
  Mask,
  Notation,
  PxBox,
  RasterRGBA,
  StaffDebug,
  SuggestAnchor,
  SuggestDebug,
  SuggestInput,
  SuggestResult,
  SuggestSyllable,
  Suggestion,
} from './types';
