// Types shared by main (app-state.json) and renderer (home screen).
export interface RecentSourceMeta {
  siglum: string;
  /** 0..1 */
  progress: number;
}

export interface RecentMeta {
  title: string;
  author: string;
  updatedAt: string;
  thumb?: string;
  sources: RecentSourceMeta[];
}

export interface RecentEntry {
  path: string;
  meta?: RecentMeta;
}
