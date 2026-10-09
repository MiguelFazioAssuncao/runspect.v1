# Tutorial completo do Runspect

> A referência interativa também está disponível no próprio site: clique em
> **documentação da API** no rodapé do laboratório para pesquisar os métodos,
> copiar exemplos para o editor e executá-los no backend. Ela é mantida junto
> da API usada pelo visualizador.

Este documento explica como o Runspect funciona, como executá-lo e como usar
todos os métodos criados no projeto. O Runspect é um laboratório para executar
algoritmos em C++17 e visualizar, passo a passo, grafos, estruturas auxiliares
e mensagens produzidas pelo algoritmo.

## 1. Visão geral da arquitetura

O projeto possui duas partes:

- **Backend Go**: recebe o código C++, prepara um diretório temporário,
  compila com `g++`, executa por no máximo três segundos e transforma cada
  linha JSON em um passo da execução.
- **Frontend Next/React**: oferece o editor, envia o código para o backend,
  controla a linha do tempo e desenha o grafo com D3.

O fluxo completo é:

1. O usuário edita `solution.cpp` no navegador.
2. `Home.runCode` envia `POST /api/run`.
3. O rewrite do Next encaminha a requisição para `127.0.0.1:8080`.
4. O servidor chama `CppRunner.Run`.
5. O backend analisa C++ comum com Clang e insere observações automáticas;
   código que já usa `viz::` mantém seus eventos manuais.
6. O backend coleta os eventos em `ExecutionResult`.
7. `useVisualizerPlayer` reconstrói o estado até o passo selecionado.
8. `GraphCanvas`, `StructsPanel` e o terminal exibem o resultado.

Arquivos principais:

- Backend: [`backend/cmd/server/main.go`](./backend/cmd/server/main.go),
  [`backend/internal/runner/cpp.go`](./backend/internal/runner/cpp.go),
  [`backend/internal/domain/trace.go`](./backend/internal/domain/trace.go) e
  [`backend/pkg/visualizer/visualizer.h`](./backend/pkg/visualizer/visualizer.h).
- Frontend: [`frontend/src/app/page.tsx`](./frontend/src/app/page.tsx),
  [`frontend/src/hooks/useVisualizerPlayer.ts`](./frontend/src/hooks/useVisualizerPlayer.ts),
  [`frontend/src/components/visualizer/GraphCanvas.tsx`](./frontend/src/components/visualizer/GraphCanvas.tsx) e
  [`frontend/src/types/visualizer.ts`](./frontend/src/types/visualizer.ts).

## 2. Como executar

### Pré-requisitos

- Go 1.24.4 ou compatível.
- Node.js e npm.
- `g++` com suporte a C++17.
- `bubblewrap`, `util-linux` e `python3-clang` no Linux. O Dockerfile já inclui
  estas dependências.

### Terminal 1: backend

```bash
cd backend
go run ./cmd/server
```

O servidor fica disponível em `http://localhost:8080`.

O caminho do header normalmente é encontrado automaticamente. Para informar
um caminho explícito:

```bash
RUNSPECT_VISUALIZER_HEADER=/caminho/para/visualizer.h go run ./cmd/server
```

### Terminal 2: frontend

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:3000`. O rewrite configurado em
[`frontend/next.config.ts`](./frontend/next.config.ts) faz o frontend
encaminhar `/api/*` para o backend.

## 3. Visualização automática e métodos manuais

Você pode colar C++17 comum, sem `visualizer.h` e sem chamadas `viz::`, e
executá-lo. O backend observa estruturas e operações reconhecidas, gerando
passos para o mesmo player. Strings aparecem como códigos de caracteres,
vetores mostram escritas e trocas, e os elementos consultados recebem
destaques. Variáveis e matrizes aparecem nos painéis de estruturas.
Tuplas e resultados opcionais aparecem nesses mesmos painéis; `bitset`
mostra os bits como um vetor de zeros e uns. Comandos dentro de `switch`
também geram passos, incluindo a identificação de cada caso alcançado.
O catálogo inclui **Tuplas e resultado opcional** e **Bits e seleção com
switch** para experimentar esses recursos com C++17 comum.

Listas de adjacência e listas de arestas podem gerar grafos automaticamente.
Essa interpretação é inferida a partir dos tipos, nomes e operações; não há
uma interpretação visual única para todo código C++. Consulte os formatos,
dependências e limites em
[Visualização automática](./backend/AUTOMATIC_VISUALIZATION.md).

Para controlar cada destaque, legenda e frame manualmente, inclua o header
e use a namespace `viz`:

```cpp
#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    viz::set_directed(false);
    viz::add_node(1, "A");
    viz::add_node(2, "B");
    viz::add_edge(1, 2, 5);
    viz::highlight(1, "emerald");
    viz::highlight_edge(1, 2, "orange");
    viz::print("Aresta processada");
}
```

Cada chamada visual produz uma linha independente de JSON em `stdout`. A
ordem das chamadas é a ordem dos passos mostrados na linha do tempo.
Cada evento também inclui `line`, o número da linha do código do usuário que
fez a chamada. O editor usa esse campo para destacar a linha correspondente ao
frame atualmente selecionado.

## 4. API C++ do namespace `viz`

Os métodos abaixo estão implementados em
[`backend/pkg/visualizer/visualizer.h`](./backend/pkg/visualizer/visualizer.h).
Todos são `inline`, portanto podem ser usados diretamente no arquivo enviado
ao editor.

### `escape_json`

```cpp
std::string escape_json(const std::string& value)
```

Função auxiliar que escapa barra invertida, aspas, quebra de linha, retorno de
carro e tabulação. Ela é usada internamente antes de inserir textos nos
eventos JSON.

### `set_directed`

```cpp
void set_directed(bool directed)
```

Define se o grafo deve ser tratado como direcionado. O frontend usa o último
comportamento indicado pelos passos:

```cpp
viz::set_directed(false); // sem setas
viz::set_directed(true);  // com setas
```

Evento gerado: `SET_DIRECTED`.

### `add_node`

```cpp
void add_node(int id, const std::string& label = "")
```

Adiciona ou atualiza um vértice. `id` identifica o vértice e `label` é o texto
desenhado dentro dele. Se o label for omitido, o frontend usa `Node <id>`.

```cpp
viz::add_node(10, "Origem");
```

Evento gerado: `ADD_NODE`.

### `add_edge`

```cpp
void add_edge(int u, int v, int weight = 1)
```

Cria uma aresta entre `u` e `v`. `weight` aparece no meio da aresta e assume
valor `1` quando omitido.

```cpp
viz::add_edge(10, 20, 7);
```

Evento gerado: `ADD_EDGE`.

### `highlight`

```cpp
void highlight(int id, const std::string& color = "red")
```

Destaca um vértice existente e altera sua cor. A cor pode ser um nome
conhecido pelo frontend, como `red`, `emerald`, `orange` ou `yellow`, ou uma
cor CSS como `#a855f7`.

Evento gerado: `HIGHLIGHT`.

### `highlight_edge`

```cpp
void highlight_edge(int u, int v, const std::string& color = "red")
```

Destaca a aresta entre `u` e `v`. A aresta precisa ter sido adicionada antes
para que o frontend consiga aplicar o destaque.

Evento gerado: `HIGHLIGHT_EDGE`.

### `set_label`

```cpp
void set_label(int id, const std::string& label)
```

Altera o texto de um vértice já existente.

```cpp
viz::set_label(1, "Visitado");
```

Evento gerado: `SET_LABEL`.

### `set_color`

```cpp
void set_color(int id, const std::string& color)
```

Altera a cor de um vértice e o marca como destacado.

```cpp
viz::set_color(1, "blue");
```

Evento gerado: `SET_COLOR`.

### `print`

```cpp
template <typename T>
void print(const T& value)
```

Converte qualquer tipo imprimível por `std::ostringstream` em uma mensagem
visual. A mensagem aparece no terminal do editor e não altera o grafo.

```cpp
viz::print("Iniciando busca");
viz::print(42);
```

Evento gerado: `PRINT`.

### `show`

Existem duas sobrecargas:

```cpp
void show(const std::string& name,
          const std::vector<std::string>& items)

template <typename T>
void show(const std::string& name, const std::vector<T>& items)
```

Exibe o estado de uma estrutura auxiliar no painel abaixo do grafo. A
sobrecarga genérica converte cada item com `std::ostringstream` e delega para a
sobrecarga de `vector<string>`.

```cpp
vector<int> fila = {1, 2, 3};
viz::show("fila", fila);

vector<string> ordem = {"A", "B"};
viz::show("ordem", ordem);
```

Evento gerado: `SET_STRUCT`. Uma chamada posterior com o mesmo nome substitui
os itens anteriores naquele passo.

### Linha de origem dos eventos

As funções `viz::` que emitem eventos recebem internamente um último parâmetro
opcional com o padrão `int line = __builtin_LINE()`. Em C++17 com `g++`, o
valor padrão é avaliado no local onde o usuário chama a função, e não dentro
do header. Ao criar uma nova função visualizável, mantenha esse parâmetro como
o último argumento, inclua `,"line":N` no objeto JSON e passe `line` para
qualquer evento auxiliar emitido pela função.

Chamadas feitas por lambdas e funções recursivas também preservam o call site.
Se um evento antigo não tiver `line`, ele continua válido, mas não produz
destaque no editor.

## 5. Eventos e contrato de dados

O backend representa cada evento como `TraceStep`:

```json
{
  "step": 1,
  "step_event": "ADD_NODE",
  "data": {
    "id": 1,
    "label": "A",
    "line": 7
  }
}
```

O resultado HTTP é um `ExecutionResult`:

```json
{
  "success": true,
  "steps": [],
  "time_ms": 12
}
```

Em caso de falha, `success` é `false` e `errors` contém a explicação. O
backend rejeita requisições diferentes de `POST`, JSON inválido, código vazio,
código acima de 256 KiB, falhas de compilação, falhas de execução e programas
que ultrapassem três segundos.

Se o usuário editar o código depois de uma execução, as linhas capturadas
podem ficar desatualizadas; execute novamente para recalcular os call sites.

## 6. Métodos e funções do backend

### `main`

Localizado em [`backend/cmd/server/main.go`](./backend/cmd/server/main.go).
Lê `RUNSPECT_VISUALIZER_HEADER`, aplica os caminhos padrão, cria o
`CppRunner`, registra o endpoint `/api/run` e inicia o servidor HTTP.

### `NewCppRunner`

```go
func NewCppRunner(headerPath string) *CppRunner
```

Constrói um runner guardando o caminho do header que será copiado para o
diretório temporário.

### `CppRunner.Run`

```go
func (r *CppRunner) Run(code string) domain.ExecutionResult
```

Executa o ciclo completo: cria o diretório temporário, copia
`visualizer.h`, salva `solution.cpp`, compila com `g++ -O0 -std=c++17`, executa
com timeout, lê cada linha de `stdout`, ignora linhas que não sejam eventos
JSON válidos e devolve os passos e o tempo total.

### Handler de `/api/run`

É a função anônima registrada por `http.HandleFunc`. Ela configura os headers
CORS e JSON, valida método e corpo, chama `cppRunner.Run` e escolhe status
`200` para sucesso ou `422` para erro de compilação/execução.

## 7. Métodos e funções do frontend

### `Home` e `runCode`

[`frontend/src/app/page.tsx`](./frontend/src/app/page.tsx) contém o componente
principal `Home`. Ele mantém o código, passos, saída, erro e carregamento.
Sua função interna `runCode` faz o `fetch`, atualiza os passos e exibe a
mensagem de sucesso ou erro.

O componente também carrega os exemplos de `examples`, troca o código pelo
`select` e conecta todos os controles ao hook do player.

### `useVisualizerPlayer`

Em [`frontend/src/hooks/useVisualizerPlayer.ts`](./frontend/src/hooks/useVisualizerPlayer.ts),
o hook mantém o estado da reprodução:

- `nextStep`: avança um passo e pausa ao chegar ao último.
- `prevStep`: volta um passo, sem permitir índice negativo.
- `seek`: salta para um índice limitado ao intervalo válido.
- efeito de reprodução: agenda o próximo passo com intervalo `1000 / speed`.
- efeito de reset: volta ao primeiro passo quando a lista `steps` muda.
- `keyOf`: cria a chave da aresta; em grafo não direcionado normaliza a ordem
  dos vértices.
- `graphState`: aplica eventos até o passo atual e monta `nodes` e `edges`.
- `logs`: coleta mensagens dos eventos `PRINT`.
- `structs`: mantém a última versão de cada `SET_STRUCT`.
- `directed`: identifica se algum `SET_DIRECTED` desativou a orientação.

O hook retorna esses dados e também `setIsPlaying` e `setSpeed` para os
controles da interface.

### `GraphCanvas`

Em [`frontend/src/components/visualizer/GraphCanvas.tsx`](./frontend/src/components/visualizer/GraphCanvas.tsx),
o componente usa D3 para desenhar o grafo:

- `resolveColor`: converte nomes de cores para hexadecimais.
- `nodePosition`: obtém coordenadas de um nó ou usa `(0, 0)` para um ID.
- `edgeGeometry`: calcula linhas ou curvas, posição do peso e espaço para a
  ponta da seta.
- `render`: prepara nós, filtra arestas inválidas, cria marcadores, inicia a
  simulação de forças e desenha elementos SVG.
- `updatePositions`: atualiza caminhos, rótulos e transformações a cada tick.
- `ResizeObserver`: chama `render` quando o painel muda de tamanho.

As posições são guardadas em `positionsRef`, evitando que o grafo salte
desnecessariamente ao avançar na linha do tempo.

### `CodeEditor`

Em [`frontend/src/components/editor/CodeEditor.tsx`](./frontend/src/components/editor/CodeEditor.tsx),
renderiza o Monaco Editor e o botão de execução. O efeito ligado a `logs.length`
mantém o terminal rolado até a saída mais recente.

### `TimelineControls`

Em [`frontend/src/components/visualizer/TimelineControls.tsx`](./frontend/src/components/visualizer/TimelineControls.tsx),
renderiza reiniciar, anterior, play/pause, próximo, slider de progresso e
velocidades `0.5x`, `1x`, `2x` e `4x`. `hasSteps` desabilita os controles
quando não existe execução.

### `StructsPanel`

Em [`frontend/src/components/visualizer/StructsPanel.tsx`](./frontend/src/components/visualizer/StructsPanel.tsx),
retorna `null` sem estruturas e, caso contrário, renderiza cada nome e seus
itens como chips. Uma estrutura vazia mostra `vazio`.

### `RootLayout`

Em [`frontend/src/app/layout.tsx`](./frontend/src/app/layout.tsx), configura as
fontes Geist, os metadados da página e o idioma `pt-BR`.

### `resolveColor`, `nodePosition` e `edgeGeometry`

Essas funções auxiliares de desenho são independentes do React e explicam a
geometria visual:

1. `resolveColor` aceita nomes amigáveis ou cores CSS.
2. `nodePosition` normaliza referências numéricas e objetos simulados.
3. `edgeGeometry` calcula uma linha reta ou uma curva quadrática quando há
   arestas opostas em um grafo direcionado.

## 8. Exemplo completo: busca em largura

```cpp
#include <bits/stdc++.h>
#include "visualizer.h"
using namespace std;

int main() {
    viz::set_directed(false);

    vector<pair<int, int>> arestas = {{1, 2}, {1, 3}, {2, 4}, {3, 4}};
    vector<vector<int>> adj(5);

    for (int i = 1; i <= 4; i++) {
        viz::add_node(i, "N" + to_string(i));
    }
    for (auto [u, v] : arestas) {
        viz::add_edge(u, v);
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    queue<int> fila;
    vector<bool> visitado(5, false);
    fila.push(1);
    visitado[1] = true;

    while (!fila.empty()) {
        int u = fila.front();
        fila.pop();
        viz::highlight(u, "orange");
        viz::print("Visitando " + to_string(u));

        vector<string> estado;
        queue<int> copia = fila;
        while (!copia.empty()) {
            estado.push_back(to_string(copia.front()));
            copia.pop();
        }
        viz::show("fila", estado);

        for (int v : adj[u]) {
            viz::highlight_edge(u, v, "emerald");
            if (!visitado[v]) {
                visitado[v] = true;
                fila.push(v);
                viz::set_color(v, "yellow");
            }
        }
        viz::set_color(u, "emerald");
    }
}
```

## 9. Limitações importantes observadas

- O programa C++ precisa escrever os eventos por meio da API para que eles
  apareçam na visualização; `cout` comum não vira automaticamente um passo.
- `highlight_edge` só altera uma aresta que já exista no estado reconstruído.
- O visualizador ignora arestas com extremos inexistentes ou laços
  (`u == v`).
- O timeout de três segundos inclui a execução do binário, não a compilação.
- O backend lê eventos linha a linha; por isso cada evento deve terminar com
  uma quebra de linha, como a API já faz.
- A visualização do grafo é reconstruída até o passo atual. Voltar na linha do
  tempo desfaz visualmente os eventos posteriores sem executar o C++ outra vez.

Este tutorial foi adicionado como documentação e não substitui nem modifica
o código-fonte existente.
