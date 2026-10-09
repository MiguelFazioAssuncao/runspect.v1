# Download do grafo em SVG

Execute um exemplo com grafo, escolha o passo desejado e clique em **SVG**. A janela pausa o player e fixa o conteúdo desse passo. A prévia e o arquivo usam o mesmo SVG; mudanças posteriores na simulação não alteram a exportação aberta.

## Opções

- **Enquadramento:** grafo completo com margem para textos e setas, ou recorte atual da tela, preservando zoom e deslocamento.
- **Fundo:** escuro, branco ou transparente. O fundo branco adapta textos externos e contornos; o transparente não adiciona retângulo de fundo nem halos escuros nos textos.
- **Tamanho:** 1×, 2× ou 4×, com dimensões finais visíveis na janela. O conteúdo continua vetorial e editável.
- **Nome:** editável, com extensão `.svg` automática e correção de caracteres incompatíveis com nomes de arquivo.
- **Descrição:** opcional nos metadados, incluindo informações do grafo e a legenda do passo. O título identifica o passo da execução.

Fundo, enquadramento, tamanho e inclusão de descrição permanecem selecionados nas próximas exportações da sessão. O nome começa com o número do passo atual. É possível baixar novamente sem fechar a janela; Escape e os botões de fechamento restauram o foco ao controle que a abriu.

O arquivo contém o grafo, seus rótulos, pesos, cores, destaques e setas. Vetores, estruturas, legenda de cores e painéis de análise não são incluídos. Os textos usam fontes comuns (`Arial`, `Helvetica` e `monospace`), sem depender das fontes do site.

## Correções associadas

O grafo completo é enquadrado pelas dimensões do grupo que contém nós, arestas e textos, sem o transform de zoom. O recorte preserva o `viewBox` e o transform originais. A medição ocorre antes da clonagem: [`getBBox()` não incorpora o transform do próprio elemento](https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getBBox).

Foi corrigido um caso em que vetores e análises comprimiam a altura do grafo a zero no desktop, impedindo a exportação. A área agora mantém uma altura mínima para o grafo e permite rolagem dos painéis. URLs de download também são liberadas após um intervalo que permite ao navegador começar a ler o arquivo.

## Validação

- 123 testes do frontend passaram, incluindo seis novos testes de enquadramento, escala e nomes de arquivo; lint e build de produção, incluindo TypeScript, passaram.
- Download real de Dijkstra com fundo branco, escala 2× e nome Unicode: XML válido, cinco vértices, sete arestas e descrição presentes; zoom removido no enquadramento completo.
- Download real com fundo transparente, escala 4× e recorte atual: XML válido, sem retângulo de fundo ou descrição, mantendo o transform original.
- Prévia de Kahn: seis vértices e seis arestas com setas; todas as referências de marcadores resolvidas. Grafo completo após zoom, manutenção das preferências e restauração de foco também foram conferidos.

A validação manual ocorreu no navegador integrado. Ainda não foi realizada uma matriz de importação em editores externos de SVG.
