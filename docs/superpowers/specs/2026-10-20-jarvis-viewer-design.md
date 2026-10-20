# Jarvis Viewer para o Claude Code — design

Data: 2026-10-20 · Dono: Niuarque Batista · Status: revisado pelo construtor; aguardando aprovação do dono. Decisões marcadas *(minha escolha)* foram tomadas pelo Claude e podem ser revistas; o resto foi decidido pelo dono na conversa.

## 1. Intenção

Um mod do Claude Code (app desktop, Windows) que deixa o Claude **explicar desenhando**: quando um conceito, uma arquitetura, um fluxo ou um resultado fica mais claro visto, o Claude monta uma **cena animada em three.js**, dividida em **passos narrados**, e a mostra no **navegador embutido do app, ao lado do chat**.

Por quê: "humanos funcionam melhor enxergando o desenho de como as coisas funcionam". O dono quer o Jarvis explicando algo e, ao mesmo tempo, a ideia se montando numa animação — entendimento e absorção muito maiores do que só texto ou voz.

Referência aprovada pelo dono ("exatamente isso… perfeito"): o rascunho em que o Jarvis explica a própria arquitetura em 5 passos — peças 3D (caixa, octaedro, orbe com gaiola, pessoa) em linha, rótulos HTML projetados, a peça da vez acende e pulsa, "pacotes" luminosos com rastro correm por arcos entre as peças (arco de cima na ida, de baixo na volta), legenda com indicador de passos embaixo, botões ▶ Explicar / ⟲ Recomeçar e interruptor de narração em cima, arrastar para girar. O rascunho está reproduzido no Apêndice A como referência visual.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos (v1)**
- Mod separado, repositório próprio (`Projetos\mods-jarvis-viewer` → github.com/niuarque-br/mods-jarvis-viewer). Funciona **com ou sem** o Modo Jarvis instalado e ligado.
- Mostra **só** no navegador embutido do app desktop. Não há janela externa do Edge.
- Cenas three.js animadas e passo a passo, nos tipos da seção 6.
- Narração conforme a seção 5.3: pelo Jarvis quando ele está ligado; senão pela própria página, ou só legenda.
- Opções **Apresentação** (`IA escolhe` | `Sob demanda`) e **Narração** (ligada | desligada) — seção 7.
- Clicar numa peça faz o Claude explicar aquela parte.
- Rever: "de novo", "volta no passo 3" sobre a última cena.

**Não-objetivos (v1)**
- Janela externa (Edge `--app`). Foi descartada pelo dono para simplificar.
- Terminal puro, VS Code e app móvel: o viewer depende do navegador embutido do app desktop. *(minha escolha: em outra superfície, a ferramenta responde que o viewer não está disponível ali e o Claude segue só com texto)*
- Editar a cena à mão, exportar vídeo ou GIF, compartilhar a cena.
- macOS e Linux.

**Anti-objetivos (seria fracasso mesmo funcionando)**
- **Desenho como enfeite**: no modo `IA escolhe`, abrir o viewer para respostas curtas, ajustes pontuais ou perguntas de sim ou não.
- **Duas vozes** ao mesmo tempo (página e Jarvis), ou o Jarvis ouvir a narração da página como se fosse o dono.
- **Cena dessincronizada**: a cena mostra o passo 4 enquanto a voz ainda fala o passo 2.
- **Gráfico que engana**: barras em perspectiva que distorcem a comparação, ou eixos sem escala legível.
- Cena que engasga (abaixo de ~50 fps numa máquina de escritório comum) ou que demora visivelmente a aparecer depois que o Claude a manda.

## 3. Restrições conhecidas

- O módulo de hooks do mod roda isolado, **sem DOM e sem Node**. Ele não serve HTTP. Tem `$.process.spawn` (stdout em fluxo), `$.http.fetch` (inclusive para `127.0.0.1`), `$.tool.register` (ferramenta `mcp__<plugin>__<nome>` servida por um hook `tool.call`), `$.prompt.submit`, `prompt.compose`, `$.command.register`, `$.store` (entre sessões), `$.state`, `userConfig` e `$.audio.speak` (voz da plataforma).
- **Quem abre o navegador embutido é o Claude**, pela ferramenta `preview_start` com `url`. O mod não consegue abri-lo.
- O navegador embutido mostra arquivos locais (`file://`) fora do projeto **só como imagem parada** (testado em 2026-10-20). Por isso a página precisa vir de um endereço `http://127.0.0.1`, e é preciso um **processo auxiliar** servindo HTTP.
- Testado no navegador embutido em 2026-10-20: WebGL e three.js r170 rodam; `speechSynthesis` tem as vozes **Microsoft Daniel** e **Microsoft Maria** (pt-BR, locais); `http://localhost:<porta>` abre normalmente.
- A máquina-alvo pode não ter Python. Pelo padrão do mods-jarvis, o auxiliar vai empacotado como `.exe` (PyInstaller `--onefile --noconsole`). O spike do mods-jarvis mostrou que esse exe roda nesta máquina corporativa (Windows 10 Enterprise) sem bloqueio.
- Nada do employer do dono pode aparecer em arquivos publicados (ver o fluxo de publicação dos outros mods).

## 4. Arquitetura

```
┌──────────── Claude Code (desktop) ─────────────────┐
│ mod "jarvis-viewer" (hooks/register.tsx)            │
│  - registra a ferramenta mostrar_cena               │
│  - prompt.compose: quando e como desenhar           │
│  - /viewer, opções, $.store (narração)              │
│  - integração com o Jarvis (seção 5.3)              │
│  - stdout do auxiliar → prompt.submit (clique)      │
└───────▲──────────────────────────────┬──────────────┘
  stdout (linhas JSON)          HTTP POST 127.0.0.1:PORT/cmd (token)
┌───────┴──────────────────────────────▼──────────────┐
│ viewer-helper.exe (Python stdlib, empacotado)        │
│  - serve a página e o three.js                       │
│  - SSE /events → página                              │
│  - POST /event da página → stdout                    │
└───────▲──────────────────────────────┬──────────────┘
     HTTP (POST)                        SSE
┌───────┴──────────────────────────────▼──────────────┐
│ navegador embutido do app: http://127.0.0.1:PORT/    │
│  - motor de cenas three.js (tipos da seção 6)        │
│  - passos, legenda, narração própria (Daniel/Maria)  │
└──────────────────────────────────────────────────────┘
```

### 4.1 Ciclo de uma cena
1. O Claude chama `mcp__jarvis-viewer__mostrar_cena` com a cena (seção 6.1).
2. O mod valida a cena. Se o auxiliar ainda não está de pé, ele o inicia e espera `ready` (timeout de 10 s). Depois manda `{"type":"scene",...}` para o auxiliar.
3. O auxiliar repassa a cena à página por SSE. Se nenhuma página estiver conectada, guarda a última cena e a entrega quando uma página se conectar.
4. Resultado da ferramenta para o Claude:
   - se a página **não** está conectada: "Abra `http://127.0.0.1:PORT/?t=TOKEN` no navegador embutido com `preview_start` (parâmetro `url`). Em seguida a cena aparece sozinha.";
   - se está conectada: "Cena exibida: N passos."
   O mod sabe se há página conectada porque o auxiliar avisa no stdout (`page-open`, `page-closed`).
5. A página monta a cena e começa a reproduzir sozinha *(minha escolha: a cena chega a pedido ou por iniciativa do Claude, então tocar de imediato acompanha a explicação; ▶ fica disponível para rever)*.

### 4.2 Protocolo
O formato segue o do mods-jarvis (`conversa-helper`), adaptado:
- O mod inicia o auxiliar: `$.process.spawn({ argv:[exe, "--port", "<porta>"], env:{ VIEWER_TOKEN } })`. O token é aleatório por sessão.
- **Auxiliar → mod** (uma linha JSON por evento no stdout): `ready{port}`, `page-open`, `page-closed`, `step-done{scene,step}` (a página terminou o passo, quando ela mesma narra), `pick{scene,node}` (clique numa peça), `narration{on}` (o interruptor mudou), `error{message}`.
- **Mod → auxiliar** (`POST /cmd` com o header `X-Viewer-Token`): `scene{...}`, `play{from?}`, `goto{step}`, `advance{step}` (passo sincronizado de fora, seção 5.3), `mode{narrator:"page"|"jarvis"|"caption", narration:bool}`, `quit`.
- **Página ↔ auxiliar**: `GET /events` (SSE), `POST /event`, arquivos estáticos (`/`, `/viewer.js`, `/vendor/three.module.min.js`). Toda rota, menos `/ping`, exige o token. O auxiliar escuta só em `127.0.0.1`.
- **Porta** *(minha escolha)*: começa em 47821 e, se estiver ocupada, tenta as próximas até 47830. O viewer é **por sessão**, diferente do Jarvis, que é um só. Assim duas sessões do Claude Code podem ter cada uma o seu viewer.
- **Sessão nova** *(minha escolha)*: a página não se reconecta sozinha a uma sessão nova. A primeira cena da sessão nova devolve o endereço novo, e o Claude abre de novo com `preview_start`. Assim o token continua valendo para uma sessão só.
- **Encerramento**: quando a sessão acaba, o mod descarrega e o auxiliar morre junto (comportamento do `spawn`). A página mostra "viewer desligado — peça uma cena para religar".

## 5. Comportamento

### 5.1 Apresentação (quando o viewer aparece)
- **`IA escolhe`** (padrão): o `prompt.compose` acrescenta uma seção de sessão. Ela orienta o Claude a usar `mostrar_cena` **quando há algo com estrutura para mostrar** — um conceito com partes, uma arquitetura, um fluxo, uma sequência, uma evolução no tempo ou um resultado numérico para comparar — e a **não usar** em resposta curta, ajuste pontual ou pergunta de sim ou não. O texto exato fica com o construtor, desde que cubra esses critérios.
- **`Sob demanda`**: a seção do `prompt.compose` diz para usar `mostrar_cena` **só quando o dono pedir**. O dono pede de três jeitos:
  - `/viewer` sozinho envia como prompt "Mostre no viewer a explicação anterior.";
  - `/viewer <assunto>` envia "Explique <assunto> mostrando no viewer.";
  - uma frase como "mostra num desenho", digitada ou falada pelo Jarvis.
- Nos dois modos, a seção também explica como montar a cena: tipos, o limite de passos (seção 6.1) e o que o Claude deve escrever no chat além dela (seção 5.4).

### 5.2 Passos e reprodução
- Cada passo tem uma frase de narração (`say`) e o que acontece na cena (o foco, os pacotes, os destaques).
- **O passo termina** quando a narração daquele passo termina **e** a animação do passo termina (é o que o rascunho faz). Só a legenda: o passo dura pelo menos `max(animação, 55 ms × caracteres da frase)`.
- Controles na tela: ▶ (reproduz ou continua), ⏸, ⟲ (recomeça), clicar num ponto do indicador de passos (vai ao passo), arrastar (gira a câmera), roda do mouse (aproxima ou afasta) *(minha escolha)*.
- **"De novo" / "volta no passo 3"**: a ferramenta `mostrar_cena` aceita `{ "replay": true, "from": 3 }` sem uma cena nova, e age sobre a última cena desta sessão. O Claude a usa quando o dono pede isso.
- A página guarda as **5 últimas cenas** da sessão, com ← / → para navegar entre elas *(minha escolha)*.

### 5.3 Narração
| Situação | Quem narra | Quem avança os passos |
|---|---|---|
| Jarvis **ligado** | o Jarvis, com a voz dele | o mod do viewer: manda `advance` quando o Jarvis termina a frase do passo |
| Jarvis desligado ou não instalado, Narração **ligada** | a página (`speechSynthesis`, preferindo Microsoft Daniel pt-BR) | a página |
| Jarvis desligado ou não instalado, Narração **desligada** | ninguém: só legenda | a página |

- Com o Jarvis ligado, o interruptor da tela fica **apagado**, com a dica "narrado pelo Jarvis".
- O interruptor **🔊 Narração / 💬 Legenda** muda na hora. A página manda `narration{on}`, e o mod grava a escolha em `$.store`, que vale para as próximas sessões. O valor inicial vem da opção `Narração` do mod. Se o dono mudar a opção no `/config`, ela passa a valer de novo.
- **Integração com o Jarvis** — o mecanismo será validado no spike (seção 10). O que a integração precisa garantir:
  1. o viewer sabe **se o Jarvis está ligado agora** (e é avisado quando ele liga ou desliga no meio de uma cena);
  2. o viewer pede ao Jarvis para **falar a frase de um passo** e é avisado quando a frase **termina** (ou quando foi cortada por "pare");
  3. o filtro de eco do Jarvis trata essa fala como fala dele, porque ela passa pelo auxiliar dele;
  4. "pare", dito ao Jarvis, também pausa a cena.

  Caminho escolhido no plano *(minha escolha, revista ao planejar)*: os dois mods conversam pelo `$.state` da sessão. Cada um escreve só as próprias chaves e observa as do outro com um hook `state.set`. O viewer usa `say` e `playing`; o Jarvis usa `mode` e `said`. Como o estado é por sessão, "ligado nesta sessão" sai de graça, e não há dependência entre os plugins. O spike (Tarefa 1 do plano) confirma esse caminho. Se ele falhar, vale a alternativa (a) da seção 10.

  Caminho considerado antes: o mods-jarvis expõe um noun pequeno em `engine.create` (por exemplo `$.jarvis.isOn()`, `$.jarvis.say(text) → Promise<'done'|'stopped'>`, um evento de liga e desliga), com o contrato de tipos em `types/index.d.ts`. O viewer lista o `modo-conversa` como dependência **somente se** o engine permitir dependência opcional, porque o viewer tem que instalar e funcionar sem o Jarvis. **Isso exige uma mudança no repositório mods-jarvis.** O dono aprovou a mudança em 2026-10-20, com a condição de que ela vá num commit separado. O plano tem, portanto, uma frente própria no mods-jarvis, com testes próprios: expor o noun, permitir que o viewer segure a fala do texto que vem depois de `mostrar_cena` e repassar o "pare".
- **"Jarvis ligado" quer dizer ligado nesta sessão** *(minha escolha)*. O Jarvis atende uma sessão por vez. Se ele estiver ligado em outra sessão, o viewer desta sessão age como se ele estivesse desligado e segue a opção Narração.
- **"Pare" durante uma cena** *(minha escolha, igual ao Jarvis)*: pausa a cena e corta a fala. Se o Claude ainda estiver no turno, o turno também para. O ▶ continua do passo pausado.
- Se a integração falhar no meio (o Jarvis sumiu ou o `say` rejeitou), o viewer cai para a narração da página e mostra uma legenda discreta, "narrando pela página".
- **Ordem com a resposta do Claude**: com o Jarvis ligado, o Jarvis fala o texto da resposta do Claude **e** as frases da cena. Para não sobrepor, as frases da cena entram **depois** que a fala da resposta em curso termina. Para isso, a seção do `prompt.compose` orienta o Claude a chamar `mostrar_cena` logo depois de uma frase curta de abertura e a deixar a explicação para a cena (seção 5.4).

### 5.4 O que o Claude escreve no chat junto com a cena
*(minha escolha)* Uma frase curta de abertura, a cena e, depois dela, um resumo curto em texto. Os passos não são repetidos por extenso no chat, porque a cena já os narra. Assim o Jarvis não lê a mesma explicação duas vezes, e o texto continua útil para consulta.

Com o Jarvis ligado, a ordem da fala é: a frase de abertura, os passos da cena e, só depois do último passo, o resumo. O Jarvis guarda a fala do texto que vem depois de `mostrar_cena` até a cena terminar ou ser pausada. Essa regra faz parte do contrato da integração (seção 5.3).

### 5.5 Clicar numa peça
- Ao clicar numa peça (ou num ponto de gráfico, ou num marco de timeline), ela pisca e a página manda `pick{scene,node}`.
- Se não há turno em andamento, o mod envia como prompt "Explique a parte «<rótulo>» da cena «<título>».". Se há, guarda o pedido e o envia ao fim do turno, com o aviso "guardei: …", como o Jarvis faz.
- Passar o mouse sobre uma peça mostra uma dica com o texto `detail` dela, quando existir.

### 5.6 Visual
- Segue o rascunho: fundo escuro, névoa leve, estrelas, grade no chão, rótulos HTML projetados, legenda com indicador de passos, cor de destaque `#D97757`.
- **Tema claro** *(minha escolha)*: respeita `prefers-color-scheme`. No tema claro o fundo fica claro, as estrelas somem e as cores mantêm o contraste.
- A câmera enquadra a cena inteira em qualquer largura de painel (no rascunho, a cena cortava as pontas num painel estreito; isso foi corrigido calculando a distância pelo campo de visão horizontal).
- Desempenho: um `renderer` só; geometrias reaproveitadas; pacotes descartados ao terminar; animação parada quando a aba está oculta.

## 6. Tipos de cena

Os quatro primeiros foram pedidos pelo dono; os demais (★) foram sugeridos pelo Claude, e o dono pediu "mais o que enriqueça a explicação". **Os 10 tipos entram na v1**, por decisão do dono em 2026-10-20. O plano pode ordenar a construção (motor comum primeiro, `metafora` por último), mas a entrega só fica completa com os 10.

| Tipo | Serve para | Como anima | Dimensão |
|---|---|---|---|
| `arquitetura` | peças de um sistema e como conversam | a peça da vez acende; pacotes correm pelas ligações | 3D |
| `fluxo` | processos com decisões e repetições | um marcador percorre as etapas e escolhe um caminho em cada decisão | 2,5D |
| `grafico` | resultados: barras, linhas, rosca, dispersão | os valores crescem até o lugar; o ponto citado ganha destaque | quase plano |
| `timeline` | eventos ao longo do tempo | a câmera passeia pela linha do tempo, parando em cada marco | quase plano |
| `sequencia` ★ | quem chama quem, e em que ordem | setas aparecem uma a uma entre as colunas | 2,5D |
| `estados` ★ | algo que muda de modo | um marcador pula de estado em estado pelas transições | 2,5D |
| `camadas` ★ | pilhas e níveis | as camadas se afastam e mostram o que há entre elas | 3D |
| `arvore` ★ | hierarquias | os ramos brotam a partir da raiz | 2,5D |
| `comparacao` ★ | opção A contra opção B | lado a lado, com as diferenças pulsando | 2,5D |
| `metafora` ★ | conceitos abstratos como objetos | livre, montada com primitivas | 3D |

"Quase plano" quer dizer câmera frontal, relevo sutil e eixos legíveis. A regra é que o número nunca seja distorcido pela perspectiva.

### 6.1 Formato da cena (entrada de `mostrar_cena`)
Declarativo, em JSON. O Claude descreve **o que** mostrar, e o motor decide **como** desenhar e animar. O esquema exato fica com o construtor. Princípios:
- Campos comuns: `title`, `type`, `steps[]`. Cada passo tem `say` (a frase narrada, obrigatória), `focus` (ids que acendem) e efeitos do tipo (por exemplo `hops: [[de, para], ...]` em arquitetura e sequência, `path` em fluxo, `highlight` em gráfico e timeline).
- Por tipo:
  - `arquitetura`: `nodes[{id,label,sub?,shape?,group?,detail?}]` e `links[{from,to,label?}]`;
  - `fluxo`: `nodes` com `kind: inicio|etapa|decisao|fim` e `edges` com `label`;
  - `grafico`: `chart: barras|linhas|rosca|dispersao`, `series`, `categories`, `unit`, `axes`;
  - `timeline`: `events[{id,date,label,detail?}]`;
  - os demais seguem a mesma ideia.
- **Layout automático**: o Claude não informa coordenadas. O motor posiciona as peças (em linha, em grade ou por camadas, conforme o tipo e a quantidade). Coordenadas opcionais podem forçar a posição.
- `metafora`: primitivas permitidas (caixa, esfera, cilindro, cone, toro, plano, texto, partícula), com posição, cor e animações declarativas (mover, girar, pulsar, aparecer, sumir, seguir caminho). **Nada de JavaScript vindo do Claude** *(minha escolha: o motor só interpreta dados; isso evita quebrar a página e mantém o desenho previsível)*.
- Limites: até **12 passos** e até **40 peças**, e `say` com até ~200 caracteres. A ferramenta recusa o que passar disso, com uma mensagem que diz como corrigir.
- Cena inválida: a ferramenta devolve o erro ao Claude com o caminho do campo (`steps[2].focus: id "x" não existe`), e nada é mostrado. O Claude corrige e chama de novo.
- A descrição da ferramenta (`description` e `inputSchema`) traz um exemplo curto por tipo, para o Claude montar cenas certas de primeira.

## 7. Configuração (`userConfig` do mod)

| Opção | Padrão | Notas |
|---|---|---|
| `presentation` — "Apresentação" | `IA escolhe` | `IA escolhe` ou `Sob demanda` |
| `narration` — "Narração" | `ligada` | `ligada` (narra em voz alta) ou `desligada` (só legenda); também muda pela tela do viewer |

Com o Jarvis ligado, a narração sai sempre pelo Jarvis, qualquer que seja a opção. A voz da página é a Microsoft Daniel pt-BR, e a Maria serve de reserva *(minha escolha; uma opção de voz pode entrar depois se o dono pedir)*.

## 8. Estrutura do repositório *(minha escolha, espelhando o mods-jarvis)*
```
mods-jarvis-viewer/
  .claude-plugin/plugin.json, marketplace.json     (plugin "jarvis-viewer", marketplace "mods-jarvis-viewer")
  hooks/hooks.json, hooks/register.tsx, hooks/*.ts (cena: validação; protocolo; narração)
  hooks/*.test.ts
  types/index.d.ts
  helper/viewer/ (server.py, __main__.py)  helper/tests/
  helper/web/ (index.html, viewer.js, scenes/*.js, style.css, vendor/three.module.min.js)
  helper/web/tests/*.test.mjs                      (layout automático, validação, temporização dos passos)
  bin/viewer-helper.exe                             (PyInstaller, versionado)
  scripts/build-helper.ps1
  docs/
  README.md, LICENSE (MIT)
```
- O `three.module.min.js` (r170, MIT) é copiado do mods-jarvis. Não há referência entre os repositórios.
- Sem o exe em `bin/`, o mod roda `python -m viewer` a partir de `helper/` (modo de desenvolvimento), como no mods-jarvis.
- Git: remoto `git@github-mods-jarvis-viewer:niuarque-br/mods-jarvis-viewer.git`. A deploy key `~/.ssh/mods-jarvis-viewer_deploy` já existe. Antes de cada push, rodar `git grep` pelo nome do employer e conferir o `git status`.

## 9. Testes e verificação
- `claude plugin validate .`, `tsc -p .` e `claude plugin test .`, cobrindo:
  - validação de cenas, com casos válidos e inválidos por tipo;
  - escolha de quem narra, nas três linhas da tabela 5.3 e na queda do Jarvis no meio;
  - a seção do `prompt.compose` em cada modo de apresentação;
  - `/viewer` com e sem assunto;
  - o clique numa peça com e sem turno em andamento;
  - o protocolo de linhas;
  - `replay`/`from`.
- `pytest` no auxiliar: rotas com token, SSE, guarda da última cena, `/ping` e escolha de porta.
- `node --test` na página: layout automático (sem sobreposição, cabe no quadro), temporização dos passos e regras de gráfico (escala a partir de zero em barras).
- Ponta a ponta sem o dono: um script sobe o auxiliar, manda uma cena, abre a página num navegador sem interface, confere que o canvas desenhou e que os passos avançam.
- Verificação final (pelo dono): uma explicação de cada tipo, com e sem o Jarvis, nos dois modos de apresentação.

## 10. Riscos a validar primeiro (spike)
1. **Dependência opcional entre mods**: se o engine permite que o viewer use o noun do Jarvis quando ele existe e funcione sem ele. Se não permitir, há duas alternativas, nesta ordem:
   - (a) o Jarvis expõe uma rota local com token compartilhado por `$.store` ou arquivo, e o viewer a descobre pelo `/ping` da porta 47811;
   - (b) o mod do viewer narra pelo `$.audio.speak` quando o Jarvis está ligado (perde o filtro de eco — **rejeitado**, viola o anti-objetivo).
2. Se `preview_start` com `url` abre `http://127.0.0.1:<porta>` sem pedir aprovação a cada sessão. No rascunho foi direto, mas era `localhost`.
3. Se o navegador embutido mantém a página viva (SSE e animação) quando o painel está oculto ou em outra aba. Se não mantiver, a página pede a última cena ao voltar.
4. Desempenho com 40 peças e pacotes no navegador embutido.

## 11. Deixado ao construtor
Nomes internos, esquema JSON exato por tipo, algoritmos de layout, formas e cores padrão por tipo de peça, texto exato da seção do `prompt.compose` e da descrição da ferramenta, formato de logs de depuração, detalhes do script de build e mensagens de erro (em português, curtas).

## Apêndice A — rascunho de referência
O rascunho aprovado (`viewer-demo.html`, three.js r170, cena "Como o Modo Jarvis funciona", 5 passos) está guardado em `docs/rascunho/viewer-demo.html`. Ele é só referência visual e de ritmo, não código a reaproveitar como está.
