# Entregas da evolução

## Fase 0 — auditoria

Relatório e plano entregues antes de editar código em `auditoria-evolucao.md`.
Baseline: 173 testes frontend, ESLint/TypeScript, 107 testes C++ (28
instrumentados + 79 catálogo), Go completo passaram. Os 26 testes opcionais de
catálogo automático não estavam ativados. Bubblewrap permaneceu habilitado;
permissão de processo foi necessária para executar testes neste ambiente.

Antes: [desktop](evidencias/antes-desktop.png), [360 px](evidencias/antes-mobile360.png),
[390 px](evidencias/antes-mobile390.png), [768 px](evidencias/antes-tablet768.png).
As capturas usam componentes reais com trace determinístico; o baseline omite
Monaco. Não são fotografias de um aparelho físico.

## Fase 1 — tipos, estruturas e chamadas

Implementado: metadata de tipo/size/inicialização/truncamento compatível com
traces antigos; multiset/multimap e variantes unordered; pares e tuplas tipados;
fila/pilha de pares, priority_queue padrão em ordem de remoção; labels decimais
exatos para `long long` grande e `__int128`; eventos de entrada/saída de chamada,
identidade, pai e profundidade; restauração de variáveis locais homônimas.
Matrizes capturam acessos 2D sem reavaliar índices e dependências de DP reais.

Vistas automáticas de STL e seletor manual por variável; índices/chaves/valores,
símbolos +/−/↻/≟ e cores de alteração; paginação de 32 itens e matrizes 4×8;
size real e +N limitado na captura. Strings mostram caracteres. Árvores binárias
por arrays com índices de heap e union-find por vetor de pais validado estão
disponíveis no seletor. Histórico de chamadas e pilha mostram ativa/retornada.
Player de estruturas/stdout/logs passou a acumular eventos incrementalmente.

Fixture equivalente: `backend/internal/runner/testdata/kuhn_difference.cpp`.
Entrada obrigatória produz `2\n`; antes de matching A=(1,2), B=(3,4), k=1,
g sem arestas, par=[-1], visited=[0], mt=0. No final visited=[1], porque o DFS
visitou A[0]. Esse valor final não contradiz o estado anterior solicitado.
`assign` global e local funcionou; não reproduzimos o erro na linha 57 original,
pois o código completo não foi anexado. Encontramos e corrigimos a reutilização
de cache de uma variável homônima no início de chamada recursiva.

Validação: sete integrações novas compilam/instrumentam/executam C++ real;
quatro regressões Go novas passam com bubblewrap. Unit tests de apresentação,
replay e metadata, ESLint e TypeScript passaram (contagens finais no registro
de validação). Browser valida caso obrigatório e caminho aumentante em 1440/360
sem overflow horizontal da página.

Adiado: objetos personalizados por ponteiros não são expandidos; árvores
arbitrárias usam representação por arrays e seleção manual. Comparadores
personalizados de priority_queue preservam apenas topo/size para não executar
código do autor durante observação. Inferência de UF e árvores a partir do
algoritmo será complementada na Fase 4. Bugs de análise/grafo e mobile seguem
para Fases 2/3 conforme plano. Limite de 256 elementos/2.000 passos permanece.

Como testar:

```sh
cd frontend
npm test
npx vitest run --config vitest.cpp.config.mts tests/cpp/evolution.integration.ts
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node scripts/evolution-browser.mjs
```

Depois: [desktop](evidencias/fase1-desktop.png), [mobile](evidencias/fase1-mobile.png).
Browser monta aplicação real; substitui Monaco por textarea para tornar o editor
determinístico e manter o C++ visível. Trace vem do instrumentador e GCC reais;
HTTP recebe essa resposta pré-calculada no harness. Detalhes em
`evidencias/fase1-browser.json`.
