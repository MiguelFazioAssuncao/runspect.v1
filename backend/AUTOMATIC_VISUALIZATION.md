# Visualização automática de C++17

Cole código C++ comum e execute. O backend analisa a árvore sintática com
libclang, insere observações em uma cópia temporária e compila com `g++`.
O código do editor permanece original. O player recebe os mesmos eventos
de vetores, grafos, estruturas e passos utilizados pela API manual.

Após executar, o player abre no primeiro passo que apresenta um vetor,
grafo, matriz ou estrutura do programa. Em algoritmos que usam apenas
escalares, ele abre no primeiro passo com variáveis preenchidas. Os passos anteriores continuam
disponíveis pela linha do tempo e pelo botão Reiniciar.

Sem grafo, variáveis, tuplas, opcionais e matrizes ocupam a área principal
de visualização, junto aos vetores existentes. Variáveis escalares aparecem
como cartões de nome e valor. O quadro de conclusão preserva os últimos
valores escalares observados, inclusive quando o algoritmo está em `solve()`.

## O que é acompanhado

- Variáveis escalares inicializadas, argumentos de funções e leituras
  diretas de `cin` realizadas com sucesso.
- Strings e sequências numéricas: vetores, arrays inicializados, deque,
  listas e conjuntos. Strings são apresentadas como códigos de caracteres.
- Consultas `a[i]`, comparações em condições, alterações de elementos e
  trocas identificadas pelo estado anterior e posterior do vetor.
- Matrizes numéricas, pares, mapas, filas e pilhas de tipos suportados.
- Tuplas (`std::tuple`) com elementos identificados pelo índice, resultados
  opcionais (`std::optional`) vazios ou com valor e máscaras `std::bitset`
  como vetores de zeros e uns. Os bits começam pelo índice 0, o menos
  significativo; `to_string()` imprime na ordem inversa.
- Funções comuns, blocos, laços, condições e lambdas com corpo não vazio.
  As linhas dos eventos continuam referindo-se ao código original.
- `switch`, incluindo casos encadeados, `default`, blocos por caso e
  `[[fallthrough]]`. A seleção mantém seu tipo original e é avaliada uma
  única vez. Cada caso alcançado aparece na linha do tempo.

Tuplas e opcionais expandem números, enums, strings, pares e combinações
destes com tuplas e opcionais. Elementos de tipos personalizados continuam
com a indicação `tipo não expandido`, sem copiar o objeto ou chamar seus
operadores. Elementos de referência em tuplas mostram `referência não
expandida` para evitar ler um escalar ainda não inicializado. Valores
`volatile` aninhados também não são lidos. Sequências
de tuplas, opcionais e bitsets também aparecem no painel de estruturas.

Uma declaração como `case 0: int x;` pode ser saltada por outro caso. Esses
escalares sem inicialização no escopo compartilhado não são observados, e
o backend informa esse limite. Use `case 0: { int x; ... }` para acompanhar
a variável dentro do seu bloco. Saltos com `goto` e exceções continuam com
acompanhamento parcial.

Vetores numéricos construídos de uma string com `s.begin(), s.end()` podem
ser usados como sua representação visual. Por exemplo, o KMP pode comparar
`s[i]` e `p[j]`, e os vetores `texto` e `padrao` receberem os destaques.
O padrão de cálculo `pos = i - m + 1` também é reconhecido quando `m` vem
do tamanho do padrão. Antes de destacar uma correspondência, o runtime
confere os elementos reais do texto e do padrão.

## Destaques de resultado

Uma condição direta `a[i] == alvo` verdadeira destaca o elemento encontrado
em verde. Esse destaque permanece nas leituras seguintes e no quadro final,
até que o valor seja alterado ou a estrutura seja reinicializada. As marcas
de correspondência de strings também são preservadas.

Ao terminar normalmente `main`, a instrumentação emite um quadro de conclusão
e os valores finais dos vetores. Vetores usados em `sort`/`stable_sort`, ou
alterados após comparações entre suas posições, recebem a marca de ordenado
somente quando a sequência final estiver em ordem crescente ou decrescente.

Em grafos, `dist`/`distance`/`distancia` mostram distâncias e
`vis`/`visited`/`visitado`/`seen` indicam vértices alcançados. Valores negativos,
o máximo do tipo e constantes `INF`/`inf`/`infinity` são tratados como
distâncias inalcançáveis. Elas também aparecem como `∞` nas
células do vetor, nas legendas de leitura/escrita e no resultado final.
Os eventos preservam o valor numérico original e acrescentam rótulos de
exibição; valores grandes que não sejam sentinelas continuam sendo números.
`pai`/`parent`/`predecessor`/`prev` destacam a árvore
de descoberta. Vetores `caminho`/`path`/`shortest_path` destacam nós e arestas
em verde no quadro final, após validar que os vértices e as conexões existem
no sentido correto. Outros nomes ou representações podem usar a API manual.

O limite de passos continua valendo: uma trace truncada não recebe um
quadro de resultado inferido após atingir o limite.

## Reconhecimento de grafos

- `vector<vector<int>>` e arrays de vetores com nomes como `adj`, `g`,
  `graph`, `grafo`, `adjacency` são tratados como listas de adjacência.
- Uma sequência aninhada usada em `connections[u].push_back(v)` também
  pode ser identificada como lista de adjacência, com outro nome.
- `vector<vector<pair<int,int>>>` representa vizinhos e pesos.
- `vector<pair<int,int>> edges` ou `arestas` representa pares de vértices.
- Arestas simétricas com os mesmos pesos indicam um grafo não direcionado.
  A inferência pode mudar conforme a construção do grafo avança.

Uma matriz pode ter o mesmo tipo de uma lista de adjacência. A inferência
não revela com certeza a intenção do autor; para uma interpretação diferente
ou para controlar estados semânticos, use os métodos manuais. O painel de
grafos acompanha uma representação por execução.

## Preservação e limites

Os eventos automáticos usam um pipe separado da saída padrão. `cout` e
`printf` continuam produzindo a saída do programa, incluindo JSON comum.
O modo automático registra os bytes escritos por `cout` em eventos
`PROGRAM_OUTPUT`, associados ao passo da linha executada. O terminal e o
painel de saída acumulam somente os eventos até o passo atual; voltar na
linha do tempo também desfaz essas impressões. Saída sem acompanhamento por
linha, como `printf`, aparece no último passo.

Uma leitura isolada de `cin` que falha por entrada inválida ou insuficiente
emite `INPUT_ERROR` e encerra imediatamente o binário. A resposta retorna
`success: false` e o erro com a linha original. Leituras usadas como condições
de `if`/`while` mantêm o tratamento de falha escrito pelo autor. Acessos
instrumentados fora dos limites de sequências emitem `RUNTIME_ERROR` antes do
acesso. O frontend descarta a reprodução de execuções que falharam e mostra
o erro no terminal.

As observações não reavaliam índices e preservam o curto-circuito de
condições. Escalares e arrays sem inicialização não são lidos por uma
observação. Valores passados por ponteiros e objetos personalizados não
são expandidos automaticamente.

Esta implementação não produz a mesma explicação semântica de um exemplo
anotado manualmente para qualquer C++. Funções `constexpr`, templates,
`goto` e exceções têm acompanhamento parcial. Se a análise ou a
compilação instrumentada não for compatível com uma construção aceita pelo
GCC, o backend executa o código original e informa que a visualização ficou
indisponível, sem apresentar uma sequência inventada.

A visualização automática acompanha até 2.000 passos e 256 elementos por
estrutura, emitindo um aviso quando esse limite é atingido. O programa
continua executando sob os limites de tempo e memória do runner. A saída
total coletada também tem limite. A instrumentação adiciona custo de
execução, portanto programas próximos do limite de tempo podem excedê-lo.

## Dependências

Em Debian/Ubuntu, instale `g++`, `bubblewrap`, `util-linux` e `python3-clang`.
O Dockerfile já instala esses pacotes. Não há serviço de IA, chave de API
ou envio do código a um modelo externo nesta implementação.

Para um runtime Clang extraído fora das pastas do sistema, configure
`RUNSPECT_CLANG_RUNTIME` com seu diretório raiz. Ele deve conter os bindings
Python em `usr/lib/python3/dist-packages`, libclang e seus headers padrão.
Uma cópia em `backend/.runtime/clang` é encontrada automaticamente em
desenvolvimento, ignorada pelo Git e excluída da imagem Docker.

Depois de alterar o backend, reinicie seu processo Go. O servidor iniciado
com `go run` continua usando o binário anterior enquanto estiver ativo.

## Resposta da API

`POST /api/run` continua recebendo `code` e `stdin`. A resposta acrescenta:

- `trace_mode`: `automatic`, `manual` ou `unavailable`.
- `trace_warnings`: limites de suporte identificados na análise.

Código com chamadas à API `viz` usa o modo manual. Seus eventos e a
exportação para C++ puro continuam disponíveis.

## Desempenho no deploy

O Dockerfile prepara headers pré-compilados da biblioteca padrão para Clang
e GCC durante o build. A análise usa esse cache quando o primeiro include
do código é `<bits/stdc++.h>`, sem macros anteriores; códigos diferentes
seguem a análise normal. Um cache Clang incompatível tem fallback para a
análise normal. O diretório `RUNSPECT_CPP_CACHE` é exposto somente para
leitura no sandbox de análise e compilação. Os PCHs devem ser reconstruídos
junto com a imagem quando o compilador ou os headers mudarem. A camada Docker
desses headers é reutilizada quando apenas o servidor Go ou o runtime de
visualização muda. Os PCHs aumentam o tamanho da imagem e têm um custo de
geração no build, em troca de menos trabalho a cada execução de C++.

A compilação usa `-O0` para priorizar o tempo de resposta do visualizador.
Isso reduz o trabalho de otimização do compilador, mas programas pesados
podem executar mais lentamente; o limite de execução continua em 3 segundos.
Até 8 binários são reutilizados em um cache em memória limitado a 16 MiB.
Cada execução usa o stdin atual e os mesmos limites de sandbox. Alterações
no código, headers e instrumentador invalidam a entrada; indisponibilidade
temporária da análise não é armazenada. O cache se perde ao reiniciar o
serviço, sem depender de disco persistente do provedor.

`RUNSPECT_ANALYSIS_TIMEOUT_SEC` controla a análise separadamente da
compilação (`RUNSPECT_COMPILE_TIMEOUT_SEC`). No Docker, ambos permitem
30 segundos e `RUNSPECT_MAX_CONCURRENT=1` evita que vários compiladores
disputem os recursos do plano gratuito. A compilação de fallback recebe
um orçamento próprio. O timeout de escrita HTTP cobre todas essas etapas.

`time_ms` mede o processo completo no backend, incluindo análise e
compilação; não mede apenas o algoritmo e não inclui o tempo de despertar
um serviço suspenso pelo provedor. Depois destas alterações, faça um novo
deploy do backend com rebuild da imagem Docker para gerar os PCHs.
