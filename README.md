# Mocquereau

Ferramenta desktop (Electron) para construção de tabelas neumáticas comparativas a partir de manuscritos de canto gregoriano.

Nomeada em homenagem a **Dom André Mocquereau, O.S.B. (1849–1930)** — monge de Solesmes, pioneiro da paleografia neumática e fundador da *Paléographie Musicale*.

![Status](https://img.shields.io/badge/status-ALPHA-orange)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

## O problema

Pesquisadores de canto gregoriano precisam comparar como uma mesma peça litúrgica é notada em diferentes manuscritos. Tradicionalmente, isso é feito manualmente no Word: recortar cada neuma de cada manuscrito, sílaba por sílaba, e montar numa tabela comparativa. Para peças com 20+ fontes, o processo é **inviável**.

## A solução

Mocquereau permite:

- **Silabificação automática** do texto litúrgico em latim (Hypher + padrões hyphen-la do projeto Gregorio)
- **Gerenciamento de fontes** com metadados RISM (sigla, biblioteca, cidade, século, fólio, tipo de notação) — com import do Gueranger
- **Carregamento de imagens** por arrastar-e-soltar, clipboard (Ctrl+V), diálogo nativo, ou auto-fetch IIIF
- **Editor de recorte** com bounding boxes independentes por sílaba (estilo Word, 8 handles de resize) e suporte a múltiplas linhas de manuscrito
- **Visualização de tabela comparativa** com coluna fixa de metadados, hover tooltip, edição inline
- **Exportação DOCX** em orientação paisagem com imagens embutidas, pronto para Word

## Stack

- Electron 41 + electron-vite 5 + electron-builder 26
- React 19 + TypeScript 5.9 + Tailwind CSS 4
- Hypher + hyphen-la (silabificação latim litúrgico)
- docx (geração de .docx)

## Downloads

Instaladores pré-compilados nas [Releases](../../releases):

- **Linux**: `.AppImage` (x64) — `chmod +x` e execute
- **Windows**: `.exe` NSIS installer (x64)
- **macOS**: `.dmg` (Intel + Apple Silicon) — não assinado; System Settings → Privacy & Security → "Abrir mesmo assim"

## Desenvolvimento

```bash
git clone https://github.com/htbg/mocquereau
cd mocquereau
npm install
npm run dev      # rodar em modo desenvolvimento
npm test         # rodar testes
npm run build    # compilar (sem empacotar)
npm run dist     # gerar instaladores para o OS atual
```

## Formato de projeto

Projetos são salvos como `.mocquereau.json` — auto-contidos com imagens em base64, portáveis entre máquinas.

## Aviso Legal / Disclaimer

Este software é distribuído **NO ESTADO EM QUE SE ENCONTRA** ("AS IS"), sem garantia de qualquer tipo, expressa ou implícita, incluindo, mas não se limitando a, garantias de comercialização, adequação a um propósito específico e não violação.

Em nenhuma hipótese os autores ou detentores dos direitos autorais serão responsáveis por qualquer reclamação, danos ou outra responsabilidade, seja em ação contratual, delituosa ou de outra natureza, decorrente de, ou em conexão com, o software ou o uso ou outras negociações com o software — incluindo danos por perda de dados, projetos corrompidos, travamentos, ou qualquer outro defeito.

**Versões ALPHA são ativamente instáveis.** Recomenda-se backup regular dos seus projetos `.mocquereau.json` e uso em ambiente não-crítico até que uma versão estável seja publicada.

Ao baixar, instalar ou usar os binários fornecidos nas Releases, você assume integralmente esses riscos.

Cláusulas legais completas: seções 15 e 16 da [GPL-3.0](LICENSE).

## Licença

[GNU General Public License v3.0 or later](LICENSE) — © 2026 Gabriel Honorato Teixeira Bernardo

Sob GPL-3.0, qualquer trabalho derivado (fork, modificação, redistribuição) **deve** permanecer software livre sob a mesma licença, com o código-fonte disponível.
