# Gravação: correções e validação em 9 de outubro de 2026

## Causas reproduzidas

- **Corrida entre o player auxiliar e a captura.** Dois `requestAnimationFrame` não asseguravam que o React tivesse commitado o passo pedido. O reset assíncrono do player também podia voltar ao primeiro passo. A versão anterior falhou com “Não foi possível preparar o quadro da gravação” em vetores e grafos, especialmente após trocar de execução ou iniciar outra gravação.
- **Captura cara e repetida.** `html-to-image` percorria o DOM inteiro, copiava centenas de propriedades computadas de cada elemento, serializava SVG e rasterizava novamente em cada passo. Dois frames de espera e mais 25 ms de pausa eram acrescentados por passo.
- **Codificação redundante.** Cada estado estático era enviado ao encoder 30 vezes por segundo. O grafo também executava novamente 180 ticks de forças mesmo quando só mudavam cores ou destaques; os reducers reconstruíam todo o histórico de eventos a cada avanço.
- **Temporização e progresso incorretos.** Arredondar `30 / velocidade` por passo alongava o vídeo a 4×: oito passos geravam 3,133333 s, em vez de 3 s incluindo a pausa final. A interface mostrava 100% antes de `flush()` e exportação, e impedia cancelar nessa fase.
- **Última duração no muxer.** Na implementação instalada de `mp4-muxer`, a última entrada `stts` usa o intervalo anterior entre timestamps. Uma pausa final única de duração diferente podia ser truncada pelo player. Isso foi observado na validação da otimização e corrigido antes de entregar.

Travamentos espontâneos do encoder, da captura e do `flush()` não foram reproduzidos no dispositivo. Esses casos foram injetados nos testes para verificar timeout, cancelamento e recuperação.

## Implementação atual

O índice da gravação é explícito e pertence à sessão. `flushSync` commita esse índice; o grafo atualiza o SVG em `useLayoutEffect`. A captura lê o DOM já commitado e verifica o índice. Ela não depende de animações de tela, que podem ser suspensas em abas em segundo plano. A área auxiliar expõe também índice de evento e linha do código para verificar a sincronização.

`recordingCapture.ts` clona o HTML/SVG local e usa o CSS original, com fontes incorporadas uma vez por sessão. Consultas de mídia são resolvidas contra a janela da aplicação antes de gerar o SVG; propriedades herdadas e variáveis CSS são preservadas. Regras de CSS nesting mantêm suas declarações. Isso evita a leitura de todos os estilos computados de cada nó em cada passo. A verificação visual incluiu textos, acentos, cores, sombras, bordas, disposição dos vetores, rótulos e geometria dos grafos.

O MP4 usa uma amostra por estado, com timestamps e durações calculados em microssegundos a partir da velocidade. Nenhum passo é descartado, inclusive a 128×. A pausa final é representada por duas amostras de 500 ms, contornando a última duração do muxer. O encoder mantém a resolução e o orçamento de bitrate; as durações passadas ao muxer são as da sessão, mesmo se um encoder não devolver a duração no chunk.

Os reducers mantêm apenas o estado atual e aplicam os eventos seguintes. Voltar na linha do tempo ou mudar as flags de grafo reinicia o replay, preservando a semântica anterior. Snapshots já entregues permanecem intactos. A análise do grafo reutiliza resultados para estados equivalentes; o layout estático de forças só precisa dos ticks quando a topologia muda. A visualização também evita renderizar novamente só por uma atualização de progresso.

O progresso avança com chunks efetivamente codificados e aceitos pelo muxer. A finalização permanece abaixo de 100%; só a criação bem-sucedida do Blob conclui o processamento. O texto informa passos capturados e amostras codificadas, sem inventar uma estimativa de tempo para `flush()`.

Parar durante a preparação não cria arquivo vazio. Durante a captura, salva um MP4 parcial válido com os estados já enviados. Durante a finalização, cancela e descarta a sessão. Sair da página também descarta a sessão. Uma nova gravação pode começar após conclusão, cancelamento ou falha, sem baixar resultados atrasados. A posição do player principal e o destaque do código são preservados.

`finally` fecha VideoFrames e encoders, zera canvases, limpa a tabela de timings e desfaz recursos da captura. Listeners e timers de espera são removidos; imagens e CSS da sessão são descartados. Bitmaps que chegarem após timeout/cancelamento também são liberados. As URLs de download são revogadas quando substituídas ou quando a página desmonta. As medidas de desempenho são reiniciadas por gravação para não crescerem indefinidamente.

## Comparação medida

Chromium local, aplicação em desenvolvimento, área fixada em **682 × 606**, mesmos traces, velocidades, resolução e bitrate. Medidas de tentativas bem-sucedidas; não incluem tentativas anteriores que falharam nem o tempo de download. São observações deste dispositivo, não médias ou garantias universais.

| Exemplo | Antes | Depois | Redução |
| --- | ---: | ---: | ---: |
| Grafo de 12 vértices, 80 passos, forças, 1×; vídeo de 81 s | 14,461 s | 4,962 s | 65,7% (2,9× mais rápido) |
| Vetor de 8 elementos, 8 passos, 0,5×; vídeo de 17 s | 2,505 s | 0,429 s | 82,9% (5,8× mais rápido) |

No grafo longo, captura + preparação visual caíram de **9,590 s para 4,446 s**. Na versão corrigida, **1,271 s** desses 4,446 s foram commits/renderização e **0,164 s** foram serialização; o restante inclui fontes e rasterização. Envio ao encoder e espera por capacidade caíram de **2,502 s para 0,051 s**. `flush()` caiu de **0,041 s para 0,019 s**, e exportação de **0,0044 s para 0,0024 s**. Os custos se sobrepõem à execução interna assíncrona do codec: o tempo de envio/espera não é uma medição isolada da CPU do encoder. O grafo passou de **2.430 para 82 amostras**, mantendo os mesmos 81 segundos e estados visuais.

O vetor de 80 passos continuou falhando em várias tentativas da cópia anterior; não há uma comparação final confiável desse caso. Na versão corrigida, gerou o MP4 de 81 s em **4,998 s**.

## Validação

- **162 testes do frontend passaram**, incluindo replay incremental, tempos de 0,5× a 128×, progresso, perda de output, ausência de codecs, fila saturada, captura/flush travados, cancelamento e limpeza de resultados tardios. TypeScript e lint passaram. Build de produção com webpack passou; o build precisou executar fora do sandbox porque o subprocesso do TypeScript devolvia stdout vazio nesse ambiente.
- Nove arquivos H.264 foram baixados e reproduzidos no navegador, com durações de **1,625 a 81 s**, vetores de 8/80 passos e grafos circulares/de forças de 8/80 passos, velocidades **0,5×, 1×, 2×, 4×, 8× e 128×**. As tabelas do MP4 foram conferidas e **todos os seus 450 quadros foram decodificados**, sem perdas. Primeiro e último quadros foram exportados para inspeção visual. Outros dois testes verificaram os 80 índices/eventos/linhas de cada gravação e a estabilidade das posições do grafo nos passos que só mudam cores.
- Fallbacks **VP9 e AV1 em MP4** geraram e reproduziram vídeos de 3 s. A interface identifica o codec alternativo; todos os quadros desses dois arquivos também foram decodificados.
- Testes de navegador confirmaram cancelamento durante a preparação, MP4 parcial reproduzível, falhas injetadas de captura/encode, cancelamento de flush pendente, nova gravação após falhas e saída da página sem download tardio. Todos os VideoFrames e encoders instrumentados terminaram fechados, e os controles voltaram a funcionar.
- Exemplos reais do catálogo executados pelo backend: Busca Binária a 0,5× (**40 passos, vídeo de 81 s**); Bubble Sort a 4× (**266 passos, 67,5 s**, geração em 30,4 s); BFS circular a 8× (**253 passos, 32,625 s**, geração em 27,5 s) e BFS de forças a 16× (**253 passos, 16,8125 s**, geração em 26,2 s). A preservação do destaque do código foi confirmada na Busca Binária e no BFS. O BFS a 2× excede o limite de 120 s e é rejeitado antes da exportação.

Os tempos dos exemplos reais mostram que DOM e rasterização ainda custam em traces maiores; os ganhos medidos acima não devem ser extrapolados a todos os programas.

## Repetir os testes de navegador

Os scripts em `frontend/scripts/recording-*.mjs` usam Playwright e Chromium. Se Playwright estiver fora de `node_modules`, forneça `PLAYWRIGHT_MODULE` com o caminho de seu `index.mjs`. `CHROMIUM`, `RUNSPECT_URL` e `RECORDING_OUTPUT` também são configuráveis. Os resultados, MP4, PNG e JSON vão para `/tmp/runspect-recording` por padrão.

```bash
node frontend/scripts/recording-browser.mjs validated
node frontend/scripts/recording-lifecycle.mjs
node frontend/scripts/recording-examples.mjs
node frontend/scripts/recording-mp4.mjs validated-
```

`recording-browser.mjs` usa traces determinísticos para isolar o subsistema de gravação; `recording-examples.mjs` exige o backend e usa os programas reais. A matriz sintética bloqueia a CDN do Monaco; seus erros de carregamento foram isolados da gravação. Os testes com código destacado usam o editor real.

## Limitações

O formato de vídeo oferecido continua sendo MP4: H.264 preferencialmente, VP9/AV1 quando necessário. Compatibilidade fora do Chromium, em celulares e em outros players ainda exige validação. Os limites de **120 s, 1920 × 1080 e 96 MiB codificados** continuam ativos; o arquivo é construído em memória e esses limites não são uma garantia da RAM total do navegador.

A exportação mantém o comportamento de estados estáticos por passo. Não inclui a animação intermediária do grafo nem filma o painel do editor; o código destacado do player principal permanece na posição escolhida, e as linhas/eventos correspondentes aos estados exportados são verificados na captura. Exportar animações intermediárias exigiria produzir imagens novas para esses instantes.

A captura depende de HTML/SVG local e fontes incorporadas, como nos componentes atuais. Imagens externas ou novos componentes com CSS dependente de outros ancestrais precisarão de testes adicionais. Captura/renderização ainda usam o thread principal; cancelar não interrompe um trecho síncrono já iniciado, mas interrompe as esperas e libera seus resultados.

`mp4-muxer` está descontinuado. A migração para uma biblioteca mantida e codificação em worker continuam sendo melhorias futuras; os arquivos gerados pela implementação atual foram verificados com codecs reais.

## Fontes primárias

- [WebCodecs: VideoEncoder, VideoFrame, flush e recursos](https://www.w3.org/TR/webcodecs/)
- [html-to-image: funcionamento da captura](https://github.com/bubkoo/html-to-image)
- [mp4-muxer: APIs, manutenção e código-fonte](https://github.com/Vanilagy/mp4-muxer)
