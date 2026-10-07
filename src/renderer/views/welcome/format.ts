/** Nome do projeto a partir do caminho: sem pasta e sem .mocquereau(.json). */
export function displayName(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  return base.replace(/\.mocquereau(\.json)?$/i, "");
}

/** "27 de abril" no idioma da interface; vazio quando a data não é legível. */
export function formatRecentDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "long" }).format(date);
}
