# Visualização automática de C++17

Cole código C++ comum e execute. O backend analisa a árvore sintática com
libclang, insere observações em uma cópia temporária e compila com `g++`.
O código do editor permanece original. O player recebe os mesmos eventos
de vetores, grafos, estruturas e passos utilizados pela API manual.

Após executar, o player abre no primeiro passo que apresenta um vetor,
grafo, matriz ou estrutura do programa. Os passos anteriores continuam
disponíveis pela linha do tempo e pelo botão Reiniciar.

## O que é acompanhado

- Variáveis escalares inicializadas, argumentos de funções e leituras
  diretas de `cin` realizadas com sucesso.
- Strings e sequências numéricas: vetores, arrays inicializados, deque,
  listas e conjuntos. Strings são apresentadas como códigos de caracteres.
- Consultas `a[i]`, comparações em condições, alterações de elementos e
  trocas identificadas pelo estado anterior e posterior do vetor.
- Matrizes numéricas, pares, mapas, filas e pilhas de tipos suportados.
- Funções comuns, blocos, laços, condições e lambdas com corpo não vazio.
  As linhas dos eventos continuam referindo-se ao código original.

Vetores numéricos construídos de uma string com `s.begin(), s.end()` podem
ser usados como sua representação visual. Por exemplo, o KMP pode comparar
`s[i]` e `p[j]`, e os vetores `texto` e `padrao` receberem os destaques.
O padrão de cálculo `pos = i - m + 1` também é reconhecido quando `m` vem
do tamanho do padrão. Antes de destacar uma correspondência, o runtime
confere os elementos reais do texto e do padrão.

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
As observações não reavaliam índices e preservam o curto-circuito de
condições. Escalares e arrays sem inicialização não são lidos por uma
observação. Valores passados por ponteiros e objetos personalizados não
são expandidos automaticamente.

Esta implementação não produz a mesma explicação semântica de um exemplo
anotado manualmente para qualquer C++. Funções `constexpr`, templates,
`switch`, `goto` e exceções têm acompanhamento parcial. Se a análise ou a
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
