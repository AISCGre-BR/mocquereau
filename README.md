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

Instaladores pré-compilados em [github.com/AISCGre-BR/mocquereau/releases](https://github.com/AISCGre-BR/mocquereau/releases):

- **Linux**: `.AppImage` (x64) — `chmod +x` e execute
- **Windows**: `.exe` NSIS installer (x64)
- **macOS**: `.dmg` (Intel + Apple Silicon) — não assinado; System Settings → Privacy & Security → "Abrir mesmo assim"

## Desenvolvimento

```bash
git clone https://github.com/AISCGre-BR/mocquereau
cd mocquereau
npm install
npm run dev      # rodar em modo desenvolvimento
npm test         # rodar testes
npm run build    # compilar (sem empacotar)
npm run dist     # gerar instaladores para o OS atual
```

## Formato de projeto

Projetos são salvos como `.mocquereau.json` — auto-contidos com imagens em base64, portáveis entre máquinas.

## Modos de silabificação

O Mocquereau oferece 5 modos de hifenização do texto litúrgico latino:

| Modo | Descrição |
|------|-----------|
| **Cantado (padrão)** (`sung`) | Padrões do [gregorio-project/hyphen-la](https://github.com/gregorio-project/hyphen-la) + pós-processador fonético que alinha a saída com a convenção cantada (AISCGre Brasil / Clayton Dias / Solesmes em livros cantados). Ex.: `om-ní-po-tens`, `A-do-rá-mus`, `Quó-ni-am`, `pro-pter`. |
| **Litúrgico tipográfico** (`liturgical-typographic`) | Padrões originais do gregorio-project/hyphen-la sem modificação. Mantém divisões etimológicas (`om-ní-pot-ens`, `Ad-o-rá-mus`, `quon-i-am`). Use para conformidade com tipografia litúrgica impressa tradicional. |
| **Clássico** (`classical`) | Pacote `hyphen/la-x-classic`. Latim clássico pré-medieval. |
| **Moderno** (`modern`) | Pacote `hyphen/la`. Latim moderno não-litúrgico. |
| **Manual** | Usuário digita os hifens diretamente. |

### Fonte canônica do modo "Cantado"

As regras de silabificação do modo cantado seguem a sistematização do
**Prof. Dr. Clayton Júnior Dias** (AISCGre Brasil), em *Aula 7: Dicção
do Latim — normas gerais* (disciplina Semiologia Gregoriana I, Curso
de Pós-Graduação Lato Sensu em Canto Gregoriano). Esta convenção é
consistente com a prática Solesmes para livros cantados descrita em
*Distinction des syllabes dans les mots latins* (Études Grégoriennes
XLII, 2016).

O pós-processador implementa 10 regras fechadas (R1-R10) que operam
sobre a saída do Hypher+hyphen-la. Regras novas só são adicionadas
com justificativa explícita por regra de Clayton Dias.

### Compatibilidade com projetos v1.0

Projetos criados com o Mocquereau v1.0 usavam o modo `liturgical` como
default. Ao abrir um projeto v1.0 no v1.1+, o modo é automaticamente
remapeado para `sung` (novo padrão alinhado à convenção cantada).
Para preservar o comportamento v1.0 exato, selecione manualmente o
modo "Litúrgico tipográfico" após abrir.

## Navegação da tabela comparativa

Para peças longas (Glória, Credo, Sanctus longo — 40+ sílabas), a
TablePreview oferece controles de zoom:

| Ação | UI | Atalho |
|------|-----|---------|
| Diminuir zoom | Botão `−` | `Ctrl + -` |
| Restaurar 100% | Clique no indicador percentual | `Ctrl + 0` |
| Aumentar zoom | Botão `+` | `Ctrl + =` ou `Ctrl + +` |

**Presets:** 50%, 75%, 100%, 125%, 150%.

O zoom é só-sessão (não é salvo no projeto). Reabrir o projeto volta
para 100%.

## Exportação DOCX

A exportação gera um documento Word (`.docx`) em paisagem A4 com a
tabela neumática comparativa. Para peças com mais de 20 sílabas, a
tabela é automaticamente dividida em múltiplas tabelas empilhadas
verticalmente (chunking de ~20 sílabas por página, respeitando limites
de palavra), com cabeçalhos (acentos, texto da sílaba) e coluna de
metadados repetidos em cada página. Isso garante compatibilidade com
Microsoft Word e LibreOffice em peças longas — peças curtas (≤20
sílabas) continuam com uma única tabela.

## Aviso Legal / Disclaimer

Este software é distribuído **NO ESTADO EM QUE SE ENCONTRA** ("AS IS"), sem garantia de qualquer tipo, expressa ou implícita, incluindo, mas não se limitando a, garantias de comercialização, adequação a um propósito específico e não violação.

Em nenhuma hipótese os autores ou detentores dos direitos autorais serão responsáveis por qualquer reclamação, danos ou outra responsabilidade, seja em ação contratual, delituosa ou de outra natureza, decorrente de, ou em conexão com, o software ou o uso ou outras negociações com o software — incluindo danos por perda de dados, projetos corrompidos, travamentos, ou qualquer outro defeito.

**Versões ALPHA são ativamente instáveis.** Recomenda-se backup regular dos seus projetos `.mocquereau.json` e uso em ambiente não-crítico até que uma versão estável seja publicada.

Ao baixar, instalar ou usar os binários fornecidos nas Releases, você assume integralmente esses riscos.

Cláusulas legais completas: seções 15 e 16 da [GPL-3.0](LICENSE).

## Autores e desenvolvedores

Mocquereau é um projeto da **AISCGre Brasil** (Associação Internacional de Estudos de Canto Gregoriano — Seção Brasileira).

Equipe de desenvolvimento:

- **Gabriel Honorato Teixeira Bernardo** — equipe de TI da AISCGre Brasil

Contribuições de código, testes e documentação são bem-vindas via [issues](https://github.com/AISCGre-BR/mocquereau/issues) e pull requests.

## Licença

[GNU General Public License v3.0 or later](LICENSE) — © 2026 AISCGre Brasil

Sob GPL-3.0, qualquer trabalho derivado (fork, modificação, redistribuição) **deve** permanecer software livre sob a mesma licença, com o código-fonte disponível.
