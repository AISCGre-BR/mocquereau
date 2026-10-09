# visual-check

Captura as telas do renderer (sem Electron) com Playwright, usando um projeto sintético
(`fixture.mjs`: "Puer natus est", três fontes, páginas em SVG geradas no script). Serve para
conferir à vista mudanças de interface em dois temas (`light`, `dark`) e dois tamanhos
(1440x900, 1280x720).

## Como rodar

```bash
npx playwright install chromium   # só na primeira vez
env -u ELECTRON_RUN_AS_NODE npm run visual-check
```

O script constrói o app (`electron-vite build`; a captura isolada, `node scripts/visual-check/shoot.mjs`, exige o build feito antes: `npx electron-vite build` ou `npm run build`) e grava os PNGs em
`scripts/visual-check/out/<tema>-<largura>x<altura>-<tela>.png` (ignorado pelo git).
Telas (objeto `SCREENS` em `shoot.mjs`): `welcome`, `welcome-empty`, `novo-peca`, `novo-texto`,
`novo-divisao`, `novo-conferir`, `texto`, `recortes`, `recortes-imagem`, `recortes-sugestoes`
(Ctrl+Shift+G na página de neumas sintéticos, com o detector real no worker), `recortes-area`
(ferramenta "Marcar linha de neumas" ligada, linha selecionada com alças), `fonte-dialog`,
`classificacao`, `tabela`, `exportar`.
A página de neumas (Laon 239, 6r) vem do gerador sintético dos testes do detector
(`src/renderer/lib/neume-detect/synthetic.ts`), codificada em PNG no `fixture.mjs`.
Erros de página (`pageerror`) e `console.error` são impressos e o processo sai com código 1.

## Usar outro projeto

`VISUAL_PROJECT=/caminho/projeto.json npm run visual-check`, onde o JSON tem a forma
`{ "project": <projeto v3 com image.dataUrl/imageId>, "images": [{ imageId, mimeType, b64 }] }`.
Não versione projetos com imagens reais: o repositório é público.
