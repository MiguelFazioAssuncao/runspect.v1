# Auditoria e plano de evolução do Runspect

Fase 0 — 9 de outubro de 2026. Relatório produzido antes das alterações de código.
Revisão do código de aplicação, instrumentador, headers C++, reducers, componentes,
editor, gravação, configurações, exemplos, documentação e testes; dependências
vendorizadas e arquivos gerados não são código da aplicação.

## Arquitetura e captura

Next 16/React 19/TypeScript/Tailwind oferece Monaco e envia `code`/`stdin` para
`POST /api/run`. O backend Go/Chi cria arquivos temporários, analisa C++17 com
libclang (Python), insere observações por offsets da AST e compila com GCC `-O0`.
O código exibido permanece original. Bubblewrap e prlimit limitam a execução.
Código com chamadas `viz::` conserva a instrumentação manual.

No modo automático, `automatic.h` escreve eventos JSON no FD 3, separado de
stdout. `Frame` observa valores após statements comuns, gera deltas de vetores
e grafos, snapshots textuais de estruturas/matrizes e encerra o quadro com
`STEP`. Condições/leituras podem criar quadros intermediários. `return` observa
antes da expressão. O programa executa inteiro no servidor; o player reconstrói
o prefixo dos eventos para avançar, voltar ou buscar um passo.

`GraphCanvas` usa SVG/D3 e mantém posições por ID; `VectorSortPanel` desenha
células; `StructsPanel` desenha chips/cartões e tabelas; `GraphAnalysisPanel`
calcula propriedades da topologia; `ProgramConsole` reproduz stdout até o passo.
O editor destaca a linha, mas não seus acessos. MP4 usa WebCodecs e captura DOM;
também há exportação JSON e SVG.

Limites existentes: 2.000 quadros automáticos, 256 elementos por estrutura,
100.000 eventos/8 MiB no runner, execução de 3 s/512 MiB. Cache de 8 binários,
16 MiB. Estes limites precisam aparecer como truncamento, não tamanho real.

## Inventário existente

| Dados/operação | Captura e módulo | O que aparece hoje |
|---|---|---|
| bool, char, inteiros, floats, enum | `Frame.observe` / `StructsPanel` | Nome e valor escalar; char numérico |
| vector, array, C array inicializado, list | `VECTOR_*` / `VectorSortPanel` | Índice, valor, leitura, comparação, troca, escrita, intervalo, pivô, encontrado, resultado |
| string | `VECTOR_*` | Códigos de caracteres; heurística parcial KMP e aliases |
| set, unordered_set numéricos; deque | `VECTOR_*` | Sequência sem identidade de conjunto/deque |
| pair | `SET_STRUCT Variáveis` | Par formatado em um cartão escalar |
| tuple, optional | `SET_STRUCT` / `StructsPanel` | Índices de tuple e valor/ausência de optional |
| vector/set de pair/tuple/string/optional/bitset | `SET_STRUCT` | Chips textuais, sem chaves/tipo/diff |
| bitset | `VECTOR_*` | Bits 0/1, índice 0 é o bit menos significativo |
| map, unordered_map | `SET_STRUCT` | Texto chave → valor |
| stack, queue aritméticos | `SET_STRUCT` | Ordem top/front, sem visual específico |
| priority_queue aritmética | `SET_STRUCT` | Apenas topo e tamanho |
| vector<vector<numérico>>, matriz C suportada | `SET_MATRIX` / `StructsPanel` | Tabela com índices; sem célula ativa/dependências |
| Adjacência `g/adj/graph`, nested push_back, edge list | `Frame.graph` / `GraphCanvas` | Um grafo por execução; nós e conexões |
| Adjacência de pair(vizinho,peso) | `Frame.graph` | Pesos inteiros e inferência de direção por simetria |
| Grafos manuais | `visualizer.h`, `graphReducer`, `GraphCanvas` | Direção, pesos, paralelas, laços, labels, badges, componentes, estados, caminhos |
| dist/visited/parent/path convencionais | `automatic.h` | Estados de descoberta, distâncias/∞, árvore e caminho final validados |
| Análise de grafos | `graphAnalysis`, `advancedGraph` | V/E/componentes/graus/densidade/conectividade, bipartição, ciclo/árvore/floresta, SCC, pontes/articulações, Euler/Hamilton, matching, coloração, topologia, planaridade, clique/independente/dominante/corte |
| Execução/saída | player, TimelineControls, CodeEditor, ProgramConsole | Play/pause, voltar/avançar, velocidade, slider, linha atual, logs/stdout |
| Exportações | export, svgExport, recording | JSON, SVG, MP4; telas de prévia/configuração |

## Lacunas e prioridade

| Prioridade | Dados/técnica | Lacuna verificada e decisão |
|---|---|---|
| P0 | `assign`, timing, recursão | Reproduzir caso obrigatório e restaurar estado após retorno; explicitar momento do quadro |
| P0 | Matching Kuhn A/B | IDs colidem; não há labels A/B, lados isolados nem caminho aumentante |
| P0 | Inteiros grandes | Vetores convertem para double; `long long > 2^53` inexato; `__int128` sem expansão |
| P1 | set/map/pair/tuple/vector<pair> | Capturados parcialmente; faltam tipo, chave/índice, modo manual, diff, size/truncamento |
| P1 | multiset/multimap/unordered_multiset/unordered_multimap | Traits ausentes |
| P1 | stack/queue/deque/priority_queue | Falta visual semântico; heap completo não observado |
| P1 | Matriz/grid/DP | Falta célula ativa, leituras/escritas e dependências reais por passo |
| P1 | Árvore de chamadas/pilha | Eventos de entrada/saída/parent/id ausentes; caches confundem escopos |
| P1 | Union-find/binária/genérica | Falta floresta semântica; priorizar parent e árvores representadas em arrays |
| P1 | Grafos peso/direção/paralelas/bipartido | Peso/direção já existem; paralelas automáticas perdidas, IDs A/B colidem |
| P2 | String i/j/janelas/KMP/Z | Vetor numérico e heurística KMP parcial; faltam caracteres e ponteiros explícitos |
| P2 | Trie/segment tree/Fenwick | Arrays podem aparecer, estrutura semântica não; modo manual para interpretação |
| P2 | Redes de fluxo | Manual permite label capacidade/fluxo; não há detecção automática desses campos |
| P2 | Ponteiros/referências/objetos personalizados | Referências diretas suportadas parcialmente; ponteiros e tuple de referência não expandidos por segurança de leitura |
| P2 | GIF/link compartilhável | MP4 existe; GIF e persistência para links ausentes |

## Bugs e inconsistências

1. **Bug 1: diagnóstico ainda não comprovado.** O anexo não contém o C++ exato,
   somente sua descrição. `instrument_cpp.py` observa statements comuns depois
   de executá-los (incluindo `assign`); uma falha geral de assign não foi provada.
   `return` captura antes da expressão e não há restauração formal de chamada.
   Criar fixture equivalente e testar os estados posteriores às duas atribuições,
   sem alegar reprodução da linha 57 original.
2. **Bug 2: confirmado.** `graph_snapshot` preserva direção inicial `true` para
   grafo vazio de arestas; `analyzeGraph` exige não direcionado para árvore/floresta.
   A fórmula não direcionada já aceita um vértice isolado. Tornar a convenção
   explícita: floresta vazia é floresta, árvore exige pelo menos um vértice;
   árvore/floresta de digrafo referem-se à projeção subjacente, identificada na UI.
3. **Bug 3: confirmado.** `ordem: 0` é a ordenação topológica contendo o vértice 0,
   não um contador. Rotular “ordem topológica” e explicar aplicabilidade.
4. **Bug 4: confirmado.** `g` usa IDs de linha/vizinho no mesmo domínio;
   `A`, `B`, `s1`, `s2` aparecem como texto ou não têm significado associado aos nós.
   Criar contexto bipartido com IDs distintos e rótulos de origem.
5. `Edges=map<pair<int,int>,int>` perde paralelas e pesos repetidos; direção pode
   mudar durante construção e limpar estados. Só primeiro grafo é acompanhado.
6. Caches por nome misturam locais/globais e chamadas recursivas; variáveis locais
   ficam visíveis após sair de escopo. `return` e efeitos na expressão podem
   aparecer fora de ordem.
7. `SET_STRUCT/SET_MATRIX` perde tipo/tamanho real; truncamento parece size real.
8. Verificação de limites cobre leituras simples, não todas escritas, matrizes,
   unary, chamadas ou pointers; frontend descarta trace em execução com erro.
9. Interatividade D3 é desligada em ≤900 px/pointer coarse: zoom/pan/pinch e
   botões de zoom não funcionam no mobile. Alvos têm 36–40 px, sem safe areas.
10. SVG imprime labels longos dentro de círculos fixos; chips/nomes podem cortar;
    legenda é apenas cor e aria-hidden; contraste secundário insuficiente.
11. `planarLayout` é distribuição BFS e não garante ausência de cruzamentos;
    planaridade falha com componente isolado; min-cut retorna Infinity em 0/1 nó.
12. Matching máximo da análise não é o matching executado; min-cut/coloração
    analíticos pintam automaticamente o grafo e competem com a legenda algorítmica.
13. Editor permite mudar fonte enquanto mostra linhas de uma execução anterior;
    documentação modal não gerencia foco/Escape; prefixos estruturas/logs/stdout
    são varridos a cada quadro. Vetores compactos escondem valores acima de 64 itens.
14. Análises avançadas de 20 nós/79 arestas levaram 1.623 ms no desktop;
    min-cut enumera subconjuntos apesar do nome Stoer–Wagner. Clique/independente
    dirigidos dependem da orientação; pontes dirigidas têm count sem highlight.
    Laços não têm coloração própria definida, mas aparecem com uma cor válida.
    Densidade usa denominador com laços e exibe K2 com 33%, sem explicar.
15. README anuncia 24 exemplos, mas o catálogo tem 26.

Casos de borda a testar: 0/1 vértice, desconexos, laços (ciclo, não bipartido),
paralelas (ciclo não direcionado de comprimento 2), sentidos opostos, digrafos
acíclicos cuja projeção possui ciclo, densidade simples sem laços, Euler trivial,
Hamilton sem reutilizar uma única aresta, propriedades avançadas inaplicáveis.
Índices seguem o C++ original: 0 é exibido quando realmente alocado; não remover
sentinelas de índice 1 por adivinhação.

## Plano das Fases 1–4

1. **Fase 1:** enriquecer protocolo mantendo eventos antigos; capturar tipos/size
   e números exatos, multiset variants, chamadas e acessos 2D. Projeções automáticas
   e seleção manual de estruturas, DP, floresta UF, binária por arrays; diff visual,
   índices/chaves e limites. Fixture equivalente do caso obrigatório.
2. **Fase 2:** regressões Bugs 1–4 e demais confirmados; contexto A/B e Kuhn,
   definições de grafos, fonte congelada da execução, leituras/escritas/diff ao lado,
   acesso teclado, ir para passo N, vazio vs não inicializado, posições estáveis.
3. **Fase 3:** visualização primeiro, abas para painéis auxiliares, controles fixos,
   touch ≥44 px, safe areas, gestos e redução de movimento; verificar 360×640,
   390×844, 768×1024 e inversos. Medir 200 nós no navegador; não prometer 60 fps
   em hardware físico sem medição. Usar SVG existente se a medida o justificar.
4. **Fase 4:** watches/breakpoints de replay com parser seguro; métricas observadas
   por linha/chamada/profundidade (não afirmar complexidade assintótica a partir
   de uma execução); comparação de traces e saída esperada, sugestões de padrões,
   diagnóstico/explicação contextual. Reaproveitar MP4. Compartilhar trace por
   arquivo importável; links somente se houver persistência apropriada.

Cada fase terá commit e entrega documentada com comandos, resultados, limites e
capturas desktop/mobile. Nenhuma publicação externa é necessária.

## Baseline

Frontend: 20 arquivos/173 testes passaram; ESLint e TypeScript passaram.
Go inicialmente bloqueado por `bwrap: NETLINK_ROUTE: Operation not permitted`
no sandbox do agente; repetir com permissão de processo preservando sandbox C++.
Resultado C++ e capturas de baseline serão anexados às entregas da fase.
Capturas antes: `docs/evidencias/antes-desktop.png`, `antes-mobile360.png`,
`antes-mobile390.png`, `antes-tablet768.png`. Harness de browser monta componentes
reais com trace de teste; Monaco não é montado nesse harness.
