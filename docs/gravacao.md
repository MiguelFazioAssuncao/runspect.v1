# Revisão da gravação de visualizações

## Prompt utilizado como critério de revisão

> Revise a gravação do Runspect como um subsistema de exportação de vídeos de algoritmos. Comece lendo as instruções do repositório, os componentes visuais, o player e as bibliotecas instaladas. Preserve alterações existentes e o trabalho paralelo no backend. Identifique falhas reproduzíveis na fidelidade dos quadros, na temporização, no cancelamento, no uso de memória, na negociação de codecs, na recuperação de erros e no download. Consulte a especificação WebCodecs e a documentação primária das dependências para decisões de API.
>
> Proponha mudanças proporcionais ao problema e implemente as que forem viáveis nesta revisão. Preserve a linha do tempo do usuário; fixe os passos, o layout e as dimensões da exportação; espere o commit visual do quadro; estabilize o grafo antes da captura. Evite esperas ilimitadas e polling contínuo. Garanta que VideoFrames, encoders, listeners e URLs temporárias sejam liberados tanto no sucesso quanto em falhas e ao sair da página. A interrupção voluntária deve salvar um arquivo parcial válido quando houver quadros; a saída da página deve cancelar sem disparar download. Não ofereça arquivo após falha de captura ou codificação.
>
> Limite previamente a duração e o volume de dados codificados, mantendo proporções, dimensões pares e timestamps contínuos. Dê preferência a H.264, com diagnóstico claro quando for necessário usar outro codec. Separe o motor de exportação da interface para permitir testes de falhas e recursos. Verifique os fluxos de sucesso, cancelamento na preparação e durante a captura, fila saturada, flush travado, codecs indisponíveis, limite de tamanho e limpeza depois de exceções. Rode testes, lint, TypeScript e build; quando possível, valide também o MP4 em um navegador real. Relate o que foi confirmado, limitações do ambiente e melhorias que exigem outra etapa.

## Problemas e correções

| Problema observado | Mudança implementada |
| --- | --- |
| O grafo podia ser capturado após 350 ms, durante transições de 650 ms ou simulação ainda ativa. | Modo estático da exportação: layouts fixos são aplicados diretamente e a simulação de forças executa 180 ticks antes da captura. A captura espera dois frames de renderização. |
| Os passos e o layout podiam mudar enquanto o vídeo era produzido. | Uma sessão fixa os passos, o layout, o identificador da execução e o tamanho da área. Novas execuções e gravações concorrentes são bloqueadas por referências síncronas. |
| As dimensões eram derivadas do monitor, podendo mudar o enquadramento e a legibilidade. | A exportação usa as dimensões CSS da área de visualização e escala o bitmap conforme a densidade de pixels, até 1920 × 1080, preservando proporções. |
| O tempo de cada passo era de 900 ms, diferente do segundo usado pelo player. | O vídeo usa a velocidade do player e quantiza a duração em frames de 30 fps. Os timestamps usam diferenças sucessivas para evitar erro de arredondamento acumulado. |
| Parar não interrompia a preparação, a captura ou a espera da fila e ainda acrescentava um segundo de pausa. | Sinais separados tratam interrupção voluntária e descarte da sessão. O cancelamento interrompe as esperas; um arquivo parcial é finalizado sem a pausa final. |
| A fila era consultada a cada 5 ms, sem limite de espera. | A gravação espera pelo evento `dequeue`, com timeout e remoção do listener. |
| `flush()` e a captura podiam manter a interface ocupada indefinidamente. | Esperas têm timeout; uma falha encerra o encoder e devolve uma mensagem à interface. |
| Um `encode()` que lançasse erro podia impedir `VideoFrame.close()`. | Cada VideoFrame é fechado em `finally`; todos os encoders de teste e exportação também são fechados. |
| A gravação acumulava chunks sem limite e `fastStart: 'in-memory'` guardava dados para a finalização. | Limite prévio de 120 s, limite de 96 MiB de dados codificados e reserva antecipada de metadados usando `expectedVideoChunks`. Bitmaps de captura são liberados após a cópia. |
| O download dependia de um clique automático e a URL era revogada após 10 s. | O painel mantém um link “Baixar MP4”. A URL é liberada ao substituir o vídeo ou desmontar a página. |
| A linha do tempo só era bloqueada por CSS, mantendo acesso pelo teclado. | Os controles recebem `disabled` durante a gravação; a área auxiliar também é `inert`. |
| A incorporação de fontes lia o CSS externo do Monaco e produzia erros de CORS e regras inválidas, apesar de o editor não aparecer no vídeo. | A gravação lê apenas regras acessíveis, seleciona as famílias usadas na captura e incorpora os arquivos dessas fontes uma vez por sessão. |
| O painel de análises era invisível na exportação, mas seu DOM continuava sendo clonado em cada captura. | O painel não é montado na área auxiliar; o processamento também cede 25 ms entre passos para receber eventos da interface. |

O limite de 96 MiB se refere aos chunks codificados, não à memória total do navegador. O muxer, o Blob final, o DOM e os bitmaps também usam memória. O limite de duração e o reaproveitamento do canvas tornam esse custo finito, mas não representam uma garantia de RAM máxima.

Os ticks fixos estabilizam a exportação; o vídeo mostra estados de cada passo, sem reproduzir a animação intermediária do layout. A posição exata dos nós pode diferir do painel interativo, pois o vídeo constrói seu próprio histórico visual desde o primeiro quadro.

Os timeouts e sinais cancelam as esperas da sessão. A biblioteca de captura do DOM não permite interromper todo o processamento interno: um trecho síncrono ainda pode ocupar o thread principal até terminar. Se uma captura terminar depois do cancelamento, seu bitmap é descartado e liberado.

## Validação e limites

Validação final: 104 testes do frontend passaram; lint, TypeScript e build de produção com webpack concluíram sem erros. Foram adicionados 18 testes do motor de gravação e 3 testes de incorporação de fontes.

Os testes de `recording.test.ts` simulam WebCodecs e o muxer para verificar temporização, cancelamento, falhas, limites, finalização e liberação de recursos. Eles não comprovam que todos os dispositivos possuem um encoder compatível nem substituem a reprodução de um arquivo MP4 real.

No navegador integrado, a busca binária a 4× produziu um MP4 real em H.264 (`avc1`), com 78 quadros, duração de 2,6 s e resolução de 602 × 414. Os controles da linha do tempo ficaram desabilitados durante a gravação, o player principal permaneceu no primeiro passo e o link “Baixar MP4” permitiu um segundo download. Esses valores foram confirmados também nos metadados do arquivo produzido.

Também foram gerados um grafo circular completo, com 214 quadros e 7,133 s, e um grafo de forças interrompido pelo botão Parar, com 64 quadros e 2,133 s. Ambos usam H.264; o parcial tem 602 × 414 pixels. A interface confirmou o arquivo parcial, liberou os controles e preservou a posição do player principal. Após a correção das fontes, a gravação do grafo circular não registrou erros ou avisos no console.

A geração, o download e os metadados foram verificados. A reprodução do vídeo e a compatibilidade entre navegadores ainda exigem validação manual.

Checklist de navegador para a próxima validação manual:

1. Gravar Bubble Sort e um grafo em layouts de forças e circular. Confirmar primeiro e último quadros, textos, enquadramento e duração.
2. Pressionar Parar na preparação e durante o processamento. Confirmar ausência de arquivo vazio e reprodução do arquivo parcial.
3. Alternar a velocidade antes de gravar; durante a gravação, verificar que teclado e mouse não mudam a linha do tempo ou o layout.
4. Fechar a página durante captura ou finalização. Confirmar ausência de download tardio.
5. Repetir gravações em dimensões diferentes e testar H.264 e os fallbacks em dispositivos distintos.

## Próximas melhorias

- Migrar `mp4-muxer` para uma biblioteca mantida, como Mediabunny. O mantenedor informa que o pacote atual foi descontinuado. A migração deve incluir arquivos reais e uma matriz de navegadores para conferir duração, metadata e compatibilidade do MP4.
- Exportar diretamente para disco, quando a File System Access API estiver disponível. Isso permite vídeos mais longos sem manter o arquivo inteiro em RAM; exige seleção explícita de destino e um fluxo alternativo para navegadores sem suporte.
- Mover a codificação para um Web Worker. A captura do DOM continua no thread principal, mas a comunicação pode transferir ImageBitmaps ou VideoFrames. Deve-se medir o benefício antes de acrescentar esse protocolo e seus novos caminhos de cancelamento.
- Oferecer presets de resolução, qualidade e trecho da linha do tempo após medir os custos em dispositivos reais.

## Referências

- [Especificação WebCodecs — VideoEncoder e VideoFrame](https://www.w3.org/TR/webcodecs/)
- [html-to-image — captura, dimensões e fontes](https://github.com/bubkoo/html-to-image)
- [mp4-muxer — estado de manutenção e migração](https://github.com/Vanilagy/mp4-muxer)
