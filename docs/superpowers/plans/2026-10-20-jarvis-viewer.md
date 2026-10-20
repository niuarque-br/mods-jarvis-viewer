# Jarvis Viewer — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** construir o mod `jarvis-viewer`. Ele permite ao Claude mostrar cenas three.js animadas e narradas no navegador embutido do app desktop, ao lado do chat, nos 10 tipos de cena, integradas ao Modo Jarvis.

**Arquitetura:**
- **Mod** (`hooks/register.tsx`): registra a ferramenta `mostrar_cena`, orienta o Claude pelo `prompt.compose` e escolhe quem narra.
- **Auxiliar** (`viewer-helper.exe`, Python stdlib empacotado): serve a página e repassa comandos e eventos por SSE e stdout.
- **Página** (`helper/web/`): desenha cada tipo de cena com um motor comum.
- **Integração com o Jarvis**: os dois mods conversam pelo `$.state` da sessão. Cada um escreve só os próprios valores e observa os do outro com um hook `state.set`. Os detalhes estão na Tarefa 1.

**Tecnologia:**
- Claude Code mods: TypeScript, JSX contra `h`, `claude-code/testing`.
- Python ≥ 3.11 só com a stdlib, `pytest` e PyInstaller.
- three.js r170 (ES module, já em `mods-jarvis/helper/web/vendor/three.module.min.js`).
- `node --test` para a lógica pura da página.

**Spec:** `docs/superpowers/specs/2026-10-20-jarvis-viewer-design.md`. Leia o design antes de cada tarefa. Este plano decide **como**, e o design decide **o quê**.

**Projeto de referência:** `..\mods-jarvis`. O plugin dele se chama `modo-conversa`. Copie e adapte os padrões dele (`hooks/helper.ts`, `hooks/lines.ts`, `hooks/testkit.ts`, `helper/conversa/server.py`, `__main__.py`, `bus.py`, `scripts/build-helper.ps1`). Não crie nenhuma referência de código entre os dois repositórios.

## Global Constraints

- Plugin `jarvis-viewer`, marketplace `mods-jarvis-viewer`, repositório `Projetos\mods-jarvis-viewer`, remoto `git@github-mods-jarvis-viewer:niuarque-br/mods-jarvis-viewer.git`. A licença é MIT © 2026 Niuarque Batista.
- O código do viewer é escrito **só** nesse repositório. A integração no mods-jarvis (Tarefas 17 e 18) vai num **branch e num commit separados**, no repositório mods-jarvis.
- Mostra **só** no navegador embutido do app desktop. Nunca abra uma janela do Edge.
- O auxiliar escuta só em `127.0.0.1`. O token é aleatório por sessão. Toda rota exige o token, menos `/ping`. Portas: a primeira livre de **47821 a 47830**.
- Limites de cena: **até 12 passos, até 40 peças, `say` com até 200 caracteres**.
- Opções (`userConfig`):
  - `presentation`: `IA escolhe` (padrão) ou `Sob demanda`;
  - `narration`: `ligada` (padrão) ou `desligada`.
- Textos exatos:
  - resultado da ferramenta sem página: `Abra http://127.0.0.1:<PORT>/?t=<TOKEN> no navegador embutido com preview_start (parâmetro url). Em seguida a cena aparece sozinha.`;
  - resultado com página: `Cena exibida: <N> passos.`;
  - `/viewer` sozinho: `Mostre no viewer a explicação anterior.`;
  - `/viewer <assunto>`: `Explique <assunto> mostrando no viewer.`;
  - clique numa peça: `Explique a parte «<rótulo>» da cena «<título>».`;
  - aviso ao guardar um pedido: `guardei: <texto>`;
  - dica com o Jarvis ligado: `narrado pelo Jarvis`;
  - queda da integração: `narrando pela página`;
  - página sem auxiliar: `viewer desligado — peça uma cena para religar`.
- Voz da página: `Microsoft Daniel` pt-BR; reserva `Microsoft Maria`.
- Mensagens ao dono em português, curtas. Nenhum nome do employer do dono em arquivo versionado (antes de cada commit, buscar com `git grep -i` o nome do empregador; o termo exato fica fora do repositório).
- Fluxo git do dono: trabalhar num branch (`feat/viewer-v1`), commit por tarefa, `git add` só nos arquivos da tarefa (nunca `-A`). **Não fazer push** sem o dono pedir.

## Review Focus

1. **Cena que referencia um id inexistente ou tem ids repetidos.** A ferramenta recusa e devolve o caminho do campo. A página nunca recebe essa cena. Testes na Tarefa 2.
2. **A página fechada ou recarregada no meio de uma cena.** O auxiliar guarda a última cena e a reenvia quando a página reconecta. A página recomeça no passo 1, pausada se o narrador for o Jarvis. Testes nas Tarefas 3 e 9.
3. **O Jarvis desliga no meio de uma cena narrada por ele, ou o pedido de fala fica sem resposta por mais de 30 s.** O viewer passa a narrar pela página a partir do passo atual, com a legenda `narrando pela página`. Teste na Tarefa 16.
4. **Gráfico de barras com valores negativos ou todos iguais.** As barras partem do zero, e a escala inclui o zero e o mínimo. Valores todos iguais não dividem por zero. Testes na Tarefa 13.
5. **Duas sessões ao mesmo tempo.** Cada uma sobe o próprio auxiliar numa porta diferente, e nenhuma vê a cena da outra. Teste na Tarefa 3 (escolha de porta com 47821 ocupada).

---

## Mapa de arquivos

```
mods-jarvis-viewer/
  .claude-plugin/plugin.json          manifesto + userConfig (Tarefa 2)
  .claude-plugin/marketplace.json     (Tarefa 2)
  .gitignore, LICENSE                 (Tarefa 2)
  types/index.d.ts                    PluginState do viewer: say, playing (Tarefa 2; uso na 16)
  hooks/hooks.json                    { "modules": ["./register.tsx"] }
  hooks/scene.ts                      tipos de cena, validateScene, LIMITS (Tarefa 2)
  hooks/lines.ts                      LineSplitter, cópia do mods-jarvis (Tarefa 4)
  hooks/helper.ts                     startHelper, HelperEvent, HelperHandle (Tarefa 4)
  hooks/guidance.ts                   texto do prompt.compose, viewerPrompt (Tarefa 6)
  hooks/narration.ts                  chooseNarrator, preferência em $.store (Tarefa 7)
  hooks/picks.ts                      PickQueue (Tarefa 8)
  hooks/jarvis.ts                     canal com o Jarvis: JarvisLink (Tarefa 16)
  hooks/register.tsx                  junta tudo (Tarefas 5–8, 16)
  hooks/testkit.ts                    world() falso: spawn, http, store, state (Tarefa 4)
  hooks/*.test.ts                     testes do mod
  helper/pyproject.toml, helper/launcher.py
  helper/viewer/__init__.py, __main__.py, server.py, bus.py   (Tarefa 3)
  helper/tests/test_server.py, test_main.py                   (Tarefa 3)
  helper/web/index.html, style.css                            (Tarefa 9)
  helper/web/core.js                  lógica pura: tempo dos passos, voz, histórico (Tarefa 9)
  helper/web/app.js                   SSE, controles, legenda, narração (Tarefa 9)
  helper/web/engine/stage.js          renderer, câmera, rótulos, pacotes, clique (Tarefa 10)
  helper/web/engine/layout.js         layouts puros (Tarefas 10–15)
  helper/web/scenes/<tipo>.js         um arquivo por tipo (Tarefas 11–15)
  helper/web/vendor/three.module.min.js
  helper/web/tests/*.test.mjs
  bin/viewer-helper.exe               (Tarefa 19)
  scripts/build-helper.ps1, scripts/smoke.py                  (Tarefa 19)
  docs/spike.md                       (Tarefa 1)
```

Contrato de cada tipo de cena na página: cada `scenes/<tipo>.js` exporta
`export function build(scene, stage) → { pieces: Map<id, Object3D>, play(stepIndex, step): Promise<void>, dispose(): void }`.
O `play` anima o passo e resolve quando a animação termina. O `stage` é a API da Tarefa 10.

---

### Tarefa 1: Spike — canal entre mods, superfície e navegador embutido

Descartável. Fica no scratchpad, fora dos dois repositórios. O resultado vai em `docs/spike.md` (este é o único arquivo que entra no repositório).

**Files:**
- Create: `docs/spike.md`

**Interfaces:**
- Produces: a decisão registrada em `docs/spike.md`. Ela confirma (ou troca) o canal usado nas Tarefas 16 a 18.

- [ ] **Step 1:** Crie dois mods mínimos no scratchpad, `spike-a` e `spike-b`. `spike-a` declara `PluginState['spike-a'] = { say: {id:string;text:string}|null }` e, num comando `/spike-say`, faz `$.state.set({plugin:'spike-a',key:'say'}, {id:'1',text:'oi'})`. `spike-b` faz `on('state.set', { plugin:'spike-a', key:'say' }, async ($, e, next) => { $.ui.toast('viu '+JSON.stringify(e.value)); return next(e) })` e também lê `await $.state.get({plugin:'spike-a',key:'say'})` num comando `/spike-read`.
- [ ] **Step 2:** Rode `claude plugin validate` nos dois. Anote se o `spike-b` passa ao citar uma chave de outro plugin sem `dependencies`. Se não passar, tente declarar a chave do `spike-a` no `types/index.d.ts` do `spike-b` (`declare module 'claude-code' { interface PluginState { 'spike-a': {...} } }`) e anote o resultado.
- [ ] **Step 3:** Abra uma sessão com `claude --plugin-dir <spike-a> --plugin-dir <spike-b>` e rode `/spike-say` e `/spike-read`. Esperado: o toast "viu {...}" e a leitura do valor. Anote.
- [ ] **Step 4:** Na mesma sessão, no app desktop, rode `await $.session.surfaces()` dentro de um hook e anote se inclui `desktop`.
- [ ] **Step 5:** Com um `python -m http.server 47821 --bind 127.0.0.1` rodando, abra `http://127.0.0.1:47821/` com `preview_start` (`url`). Anote se pede aprovação e se volta a pedir numa sessão nova. Com uma página de teste que conta ticks de `setInterval` e frames de `requestAnimationFrame` e mantém um `EventSource`, esconda o painel do navegador por 30 s. Anote se os ticks, os frames e o SSE continuam.
- [ ] **Step 6:** Escreva `docs/spike.md` com uma tabela "pergunta | resultado | evidência" e a **decisão**:
  - se o canal por `state.set` funcionar, ele é o canal (é o padrão deste plano);
  - se não funcionar, vale a alternativa (a) do design §10: rota HTTP do auxiliar do Jarvis, com a porta 47811 e o token gravados por ele em `%LOCALAPPDATA%\claude-modo-conversa\viewer-link.json`, `{ sessionId, port, token }`, e o viewer conferindo `sessionId`. Nesse caso, ajuste as Interfaces das Tarefas 16 a 18 antes de começá-las.
- [ ] **Step 7:** Commit.

```bash
git init -b main && git checkout -b feat/viewer-v1
git add docs/spike.md && git commit -m "docs: resultado do spike de integração"
```

---

### Tarefa 2: Esqueleto do mod e validação de cenas

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `types/index.d.ts`, `.gitignore` (igual ao do mods-jarvis), `LICENSE`, `hooks/scene.ts`, `hooks/register.tsx` (por enquanto só `export const register: Register = () => {}`)
- Test: `hooks/scene.test.ts`

**Interfaces:**
- Produces (`hooks/scene.ts`):

```ts
export const SCENE_TYPES = ['arquitetura','fluxo','grafico','timeline','sequencia','estados','camadas','arvore','comparacao','metafora'] as const
export type SceneType = typeof SCENE_TYPES[number]
export const LIMITS = { steps: 12, pieces: 40, say: 200, chartPoints: 100 } as const
export type Step = {
  say: string
  focus?: string[]                       // todos os tipos: peças que acendem
  hops?: [string, string][]              // arquitetura, camadas, sequencia: pacote de → para
  path?: string[]                        // fluxo, estados: nós percorridos, em ordem
  highlight?: string[]                   // grafico ("<serieId>#<índice>"), timeline, arvore, comparacao, sequencia (ids de mensagem)
  actions?: MetaphorAction[]             // metafora
}
export type Scene = { title: string; type: SceneType; steps: Step[] } & Record<string, unknown>
export type Validation = { ok: true; scene: Scene } | { ok: false; errors: string[] }
export function validateScene(input: unknown): Validation
export function pieceLabel(scene: Scene, id: string): string | undefined
```

- Campos por tipo (o validador exige estes; os opcionais terminam em `?`; todo item com `id` pode ter `detail?`). Peças = os itens que contam no limite de 40:

| Tipo | Campos | Peças |
|---|---|---|
| arquitetura | `nodes[{id,label,sub?,shape?:'caixa'\|'esfera'\|'octaedro'\|'cilindro'\|'pessoa'\|'orbe',group?}]`, `links[{from,to,label?}]` | nodes |
| fluxo | `nodes[{id,label,kind:'inicio'\|'etapa'\|'decisao'\|'fim'}]`, `edges[{from,to,label?}]` | nodes |
| grafico | `chart:'barras'\|'linhas'\|'rosca'\|'dispersao'`, `unit?`, `categories:string[]` (não usado em dispersao), `series[{id,label,values?:number[],points?:{x,y,label?}[]}]` | series (pontos ≤ `chartPoints` por série) |
| timeline | `events[{id,date,label}]` (na ordem dada) | events |
| sequencia | `actors[{id,label}]`, `messages[{id,from,to,label}]` | actors + messages |
| estados | `states[{id,label,initial?}]`, `transitions[{from,to,label?}]` | states |
| camadas | `layers[{id,label,items?:string[]}]` (de cima para baixo) | layers |
| arvore | `nodes[{id,label,parent?}]` (exatamente um sem `parent`) | nodes |
| comparacao | `sides` com exatamente 2 `{id,label,items[{id,label,value?}]}` | sides + items |
| metafora | `objects[{id,shape:'caixa'\|'esfera'\|'cilindro'\|'cone'\|'toro'\|'plano'\|'texto'\|'particulas',pos:[x,y,z],size?:number,color?:string,text?,label?}]`; `MetaphorAction = {target,do:'mover'\|'girar'\|'pulsar'\|'aparecer'\|'sumir'\|'seguir',to?:[x,y,z],path?:[x,y,z][],ms?:number}` | objects |

- `plugin.json`: `name`, `version: "0.1.0"`, `description`, `author`, `types: "./types/index.d.ts"`, `userConfig.presentation {type:"string", title:"Apresentação", options:["IA escolhe","Sob demanda"], default:"IA escolhe"}`, `userConfig.narration {type:"string", title:"Narração", options:["ligada","desligada"], default:"ligada"}`.
- `types/index.d.ts`: `PluginState['jarvis-viewer'] = { say: { id: string; text: string } | null; playing: boolean }`.

- [ ] **Step 1: Escreva os testes que falham** (`hooks/scene.test.ts`, com `test`/`expect` de `claude-code/testing`). Use uma cena válida mínima por tipo como fixture.

```ts
test('aceita uma cena mínima de cada tipo', () => { for (const s of FIXTURES) expect(validateScene(s).ok).toBe(true) })
test('recusa tipo desconhecido', () => expect(errs({ ...ARQ, type: 'pizza' })).toContain('type: tipo desconhecido "pizza"'))
test('recusa id inexistente no foco', () =>
  expect(errs({ ...ARQ, steps: [{ say: 'a', focus: ['x'] }] })).toContain('steps[0].focus: id "x" não existe'))
test('recusa id repetido', () => expect(errs(arqWithNodes(['a','a']))).toContain('nodes[1].id: id "a" repetido'))
test('limite de 12 passos', () => expect(errs(arqWithSteps(13))).toContain('steps: no máximo 12 passos (veio 13)'))
test('limite de 40 peças', () => expect(errs(arqWithNodes(range(41)))).toContain('nodes: no máximo 40 peças (veio 41)'))
test('say até 200 caracteres', () => expect(errs(arqWithSay('x'.repeat(201)))).toContain('steps[0].say: no máximo 200 caracteres (veio 201)'))
test('say obrigatório e não vazio', () => expect(errs(arqWithSay('  '))).toContain('steps[0].say: obrigatório'))
test('hop entre ids existentes', () => expect(errs(arqWithHops([['a','zz']]))).toContain('steps[0].hops[0]: id "zz" não existe'))
test('arvore com duas raízes', () => expect(errs(arvoreTwoRoots)).toContain('nodes: a árvore precisa de exatamente uma raiz (veio 2)'))
test('comparacao com 3 lados', () => expect(errs(cmp3)).toContain('sides: exatamente 2 lados (veio 3)'))
test('grafico de barras com valores faltando', () => expect(errs(barsShort)).toContain('series[0].values: um valor por categoria (3 categorias, veio 2)'))
test('pieceLabel', () => expect(pieceLabel(ARQ as Scene, 'aux')).toBe('Auxiliar'))
```

`errs(x)` devolve `validateScene(x).ok ? [] : errors`. As mensagens de erro acima são o formato exato: `caminho: motivo`.

- [ ] **Step 2:** Rode `claude plugin test .`. Esperado: FAIL (`validateScene` não existe).
- [ ] **Step 3:** Implemente `hooks/scene.ts` e os manifestos. Valide à mão, sem biblioteca de schema. Junte **todos** os erros, não só o primeiro.
- [ ] **Step 4:** Rode `claude plugin validate .`, `tsc -p .` e `claude plugin test .`. Esperado: tudo verde.
- [ ] **Step 5:** Commit: `feat: esqueleto do mod e validação de cenas`.

---

### Tarefa 3: Auxiliar Python (servidor local)

**Files:**
- Create: `helper/pyproject.toml` (sem dependências de runtime; `pytest` no dev), `helper/launcher.py`, `helper/viewer/__init__.py`, `bus.py` (copie `Bus.subscribe/unsubscribe/publish` do mods-jarvis, sem as aprovações), `server.py`, `__main__.py`
- Test: `helper/tests/test_server.py`, `helper/tests/test_main.py`

**Interfaces:**
- Produces:
  - `make_server(port: int, token: str, out: TextIO, web_dir: Path, on_quit: Callable[[], None] | None = None) -> ViewerServer`;
  - `run(argv: list[str], environ: Mapping[str,str], out: TextIO) -> int`. Os argumentos são `--port-from 47821 --port-to 47830`, e o token vem de `VIEWER_TOKEN`.
- Stdout (uma linha JSON por evento):
  - do próprio auxiliar: `ready{port}`, `page-open`, `page-closed`, `error{message}`;
  - repassados da página: `step-done{scene,step}`, `pick{scene,node}`, `narration{on}`, `paused{scene,step}`, `resume{scene,step}`. A página manda `resume` quando o dono aperta ▶ numa cena narrada pelo Jarvis.
- Rotas:

| Rota | Comportamento |
|---|---|
| `GET /ping` | sem token; responde `{"app":"jarvis-viewer"}` |
| `GET /?t=` | serve a página |
| `GET /<arquivo>` | estáticos de `web_dir`, nunca fora dele |
| `GET /events?t=` | SSE; ao conectar, emite `page-open` e reenvia a última `scene` e o último `mode`; ao desconectar a última página, emite `page-closed` |
| `POST /cmd` | header `X-Viewer-Token`; tipos `scene, play, goto, advance, pause, mode, quit` |
| `POST /event?t=` | tipos `step-done, pick, narration, paused, resume` |

  `GET /state?t=` responde `{"pages": <n>}`. O mod o usa para saber se há página conectada.

- [ ] **Step 1: Escreva os testes que falham.** Use a fixture `helper` no estilo do mods-jarvis, que sobe o servidor na porta 0 e usa `Out` para ler o stdout.

```python
def test_ping_sem_token(helper): assert get(helper, "/ping") == (200, {"app": "jarvis-viewer"})
def test_rotas_exigem_token(helper): assert status(helper, "GET", "/events") == 401 and status(helper, "POST", "/cmd", token=None) == 401
def test_estatico_nao_escapa(helper): assert status(helper, "GET", "/../server.py?t=" + TOKEN) == 404
def test_cmd_desconhecido(helper): assert post_cmd(helper, {"type": "xyz"}) == 400
def test_sse_recebe_cena(helper): ...  # conecta /events, POST cmd scene, primeira mensagem tem type == "scene"
def test_ultima_cena_reenviada_ao_reconectar(helper): ...  # POST scene sem página; conecta; recebe a cena
def test_page_open_e_closed_no_stdout(helper): ...  # conecta e fecha /events → eventos page-open e page-closed
def test_evento_da_pagina_vai_ao_stdout(helper): ...  # POST /event pick → stdout {"type":"pick","scene":"s1","node":"aux"}
def test_state_conta_paginas(helper): ...  # 0 → conecta → 1
def test_porta_ocupada_usa_a_proxima(tmp_path):  # test_main.py: ocupa 47821 num socket; run() emite ready com port 47822
def test_todas_ocupadas(tmp_path): ...  # faixa de uma porta ocupada → error "nenhuma porta livre entre 47821 e 47821", código 2
def test_sem_token(tmp_path): ...  # → error "VIEWER_TOKEN ausente", código 2
```

- [ ] **Step 2:** Rode `cd helper && python -m pytest -q`. Esperado: FAIL.
- [ ] **Step 3:** Implemente. Use `ThreadingHTTPServer`, `daemon_threads`, `allow_reuse_address = False` e `watch_parent(os.getppid())` (cópia do mods-jarvis). Mande um *keepalive* SSE (`: ping`) a cada 15 s.
- [ ] **Step 4:** Rode `python -m pytest -q`. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: auxiliar local do viewer`.

---

### Tarefa 4: Ponte mod ↔ auxiliar

**Files:**
- Create: `hooks/lines.ts` (cópia), `hooks/helper.ts`, `hooks/testkit.ts`
- Test: `hooks/helper.test.ts`

**Interfaces:**
- Consumes: o protocolo da Tarefa 3.
- Produces:

```ts
export type HelperEvent =
  | { type: 'ready'; port: number } | { type: 'page-open' } | { type: 'page-closed' }
  | { type: 'step-done'; scene: string; step: number } | { type: 'pick'; scene: string; node: string }
  | { type: 'narration'; on: boolean } | { type: 'paused'; scene: string; step: number } | { type: 'resume'; scene: string; step: number }
  | { type: 'error'; message: string } | { type: 'exit' }
export type HelperHandle = { port: number; token: string; url: string; send(cmd: Record<string, unknown>): Promise<void>; pages(): Promise<number>; stop(): Promise<void> }
export function helperCommand($: EngineInterface): Promise<{ argv: string[]; cwd: string }>   // bin/viewer-helper.exe ou python -m viewer
export function startHelper($: EngineInterface, onEvent: (e: HelperEvent) => void): Promise<HelperHandle>  // resolve no ready (timeout 10 s → rejeita com "O auxiliar do viewer não iniciou a tempo.")
```

- `url` = `http://127.0.0.1:<port>/?t=<token>`. O `testkit.ts` exporta `world(on, opts)` no molde do mods-jarvis: ele registra spawns, comandos, toasts, prompts, `$.store` e `pages` falsos.

- [ ] **Step 1: Testes que falham.**

```ts
test('line splitter tolera lixo e pedaços', ...)                         // como no mods-jarvis
test('prefere o exe empacotado', ...)                                    // argv[0] termina em bin/viewer-helper.exe
test('sem exe roda python -m viewer em helper/', ...)                    // argv = ['python','-m','viewer','--port-from','47821','--port-to','47830']
test('passa VIEWER_TOKEN aleatório', ...)                                // env.VIEWER_TOKEN com 16+ caracteres
test('resolve no ready com a porta anunciada', ...)                      // READY com 47823 → handle.url contém :47823/?t=
test('rejeita sem ready em 10 s', ...)                                   // mock.clock; avança 10000 → erro com a frase acima
test('send usa o header X-Viewer-Token', ...)
```

- [ ] **Step 2:** Rode `claude plugin test .`. Esperado: FAIL.
- [ ] **Step 3:** Implemente (adaptando `startHelper` do mods-jarvis, com o `ready` assíncrono).
- [ ] **Step 4:** Rode `claude plugin test .`. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: ponte entre o mod e o auxiliar`.

---

### Tarefa 5: Ferramenta `mostrar_cena`

**Files:**
- Modify: `hooks/register.tsx`
- Test: `hooks/tool.test.ts`

**Interfaces:**
- Consumes: `validateScene` (Tarefa 2) e `startHelper`/`HelperHandle` (Tarefa 4).
- Produces:
  - a ferramenta `mcp__jarvis-viewer__mostrar_cena`, registrada no `session.start` com a entrada `{ scene?: Scene; replay?: boolean; from?: number }`;
  - o comando `{type:'scene', id, scene, narrator, from:0}` ao auxiliar, onde `id` = `s<n>` sequencial na sessão e `narrator` vem da Tarefa 7 (até lá, `'page'`);
  - o estado de módulo `lastScene: { id: string; scene: Scene } | null`.
- A `description` da ferramenta diz quando usá-la, os 10 tipos, os limites e um exemplo JSON curto de `arquitetura` e outro de `grafico`. O `inputSchema` tem `type:'object'` com `scene`, `replay` e `from` (o detalhe de cada tipo fica na descrição; quem valida é o `validateScene`).

- [ ] **Step 1: Testes que falham.**

```ts
test('cena inválida → deny com os erros e nada enviado', ...)            // result.deny contém 'steps[0].focus: id "x" não existe'; cmds vazio
test('primeira cena sobe o auxiliar e devolve o endereço', ...)           // pages()=0 → texto exato "Abra http://127.0.0.1:47821/?t=... Em seguida a cena aparece sozinha."
test('com página aberta devolve Cena exibida', ...)                       // pages()=1 → "Cena exibida: 3 passos."
test('replay sem cena anterior', ...)                                     // deny "Ainda não há cena nesta sessão."
test('replay from 3 reenvia a última cena a partir do passo 3', ...)      // cmd {type:'play', id:'s1', from:2}
test('from fora da faixa', ...)                                           // deny "from: entre 1 e 3"
test('fora do app desktop', ...)                                          // session.surfaces() = ['terminal'] → deny "O viewer só funciona no app desktop; siga só com texto."
test('não sobe um segundo auxiliar', ...)                                 // duas chamadas → 1 spawn
```

- [ ] **Step 2:** Rode `claude plugin test .`. Esperado: FAIL.
- [ ] **Step 3:** Implemente: o `tool.call` com matcher `{ tool: 'mcp__jarvis-viewer__mostrar_cena' }` devolve `ToolCallResult` (`result` com o texto, ou `deny`). Quando o auxiliar termina (`exit` ou `error`), o handle é zerado e a próxima cena sobe o auxiliar de novo.
- [ ] **Step 4:** Rode `claude plugin test .`. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: ferramenta mostrar_cena`.

---

### Tarefa 6: Apresentação e `/viewer`

**Files:**
- Create: `hooks/guidance.ts`
- Modify: `hooks/register.tsx`
- Test: `hooks/guidance.test.ts`

**Interfaces:**
- Produces:
  - `guidance(presentation: string): string`. Um valor desconhecido conta como `IA escolhe`.
  - `viewerPrompt(args: string): string`.
  - A seção `{ id: 'jarvis-viewer', text: guidance(...), scope: 'session' }`, acrescentada em **todo** `prompt.compose`.
  - O comando `/viewer`, que submete `viewerPrompt(args)` com `$.prompt.submit({ text, asUser: true })`.
- O texto de `guidance` (redação livre) precisa conter:
  - o nome `mostrar_cena`;
  - os critérios de uso: conceito com partes, arquitetura, fluxo, sequência, evolução no tempo, resultado numérico;
  - os critérios de não uso: resposta curta, ajuste pontual, pergunta de sim ou não;
  - a regra do chat (design §5.4): uma frase curta antes, a cena, um resumo curto depois, sem repetir os passos;
  - em `Sob demanda`, a frase "só quando o usuário pedir";
  - o pedido de reabrir: "se o resultado pedir para abrir o endereço, chame preview_start com esse url".

- [ ] **Step 1: Testes que falham.**

```ts
test('IA escolhe orienta quando usar e quando não', () => { const g = guidance('IA escolhe'); for (const s of ['mostrar_cena','arquitetura','resposta curta','preview_start']) expect(g).toContain(s) })
test('Sob demanda só quando pedir', () => expect(guidance('Sob demanda')).toContain('só quando o usuário pedir'))
test('viewerPrompt vazio', () => expect(viewerPrompt('  ')).toBe('Mostre no viewer a explicação anterior.'))
test('viewerPrompt com assunto', () => expect(viewerPrompt('o cache')).toBe('Explique o cache mostrando no viewer.'))
test('prompt.compose acrescenta a seção', ...)       // com options { presentation: 'Sob demanda' }
test('/viewer submete o prompt', ...)
```

- [ ] **Step 2:** Rode os testes. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** Rode os testes. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: modos de apresentação e comando /viewer`.

---

### Tarefa 7: Quem narra e a preferência de narração

**Files:**
- Create: `hooks/narration.ts`
- Modify: `hooks/register.tsx`
- Test: `hooks/narration.test.ts`

**Interfaces:**
- Produces:

```ts
export type Narrator = 'jarvis' | 'page' | 'caption'
export function chooseNarrator(jarvisOn: boolean, narrationOn: boolean): Narrator
export function narrationOn(option: string | undefined, saved: { on: boolean; option: string } | undefined): boolean
```

- `narrationOn` usa o valor salvo se `saved.option === option`. Senão usa a opção (`option !== 'desligada'`). A chave em `$.store` é `narration`.
- Ao receber `narration{on}` do auxiliar, o mod grava `{ on, option: <opção atual> }` e manda `mode` à página.
- Por enquanto `jarvisOn` é sempre `false`. A Tarefa 16 liga isso ao canal com o Jarvis.

- [ ] **Step 1: Testes que falham.** Cubra a tabela completa de `chooseNarrator` (as 4 combinações; `jarvis` vence sempre). Para `narrationOn`:
  - o salvo vale com a mesma opção;
  - a opção mudada no `/config` passa a valer;
  - sem nada salvo, `ligada` dá `true`.
  E mais um teste: o evento `narration{on:false}` grava no store e manda `{type:'mode', narrator:'caption', narration:false}`.
- [ ] **Step 2:** Rode os testes. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** Rode os testes. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: escolha do narrador e preferência salva`.

---

### Tarefa 8: Clique numa peça

**Files:**
- Create: `hooks/picks.ts`
- Modify: `hooks/register.tsx` (rastreia o turno em curso com `turn.start`/`turn.complete` da sessão principal, `e.agentId === undefined`)
- Test: `hooks/picks.test.ts`

**Interfaces:**
- Produces: `class PickQueue { pick(text: string, busy: boolean): { submit?: string; caption?: string }; turnEnded(): string | null }`. Guarda o último pedido (um só; um novo substitui o anterior).
- A legenda vai à página como `{type:'caption', text:'guardei: …'}`. Acrescente `caption` à lista de comandos do auxiliar (Tarefa 3), com o teste correspondente.

- [ ] **Step 1: Testes que falham.**

```ts
test('ocioso submete na hora', () => expect(new PickQueue().pick('X', false)).toEqual({ submit: 'X' }))
test('ocupado guarda e avisa', () => expect(new PickQueue().pick('X', true)).toEqual({ caption: 'guardei: X' }))
test('fim do turno libera o guardado uma vez', ...)
test('pick do auxiliar monta o texto com rótulo e título', ...)  // "Explique a parte «Auxiliar» da cena «Como o Jarvis funciona»."
test('pick de cena antiga é ignorado', ...)                      // scene diferente de lastScene.id → nada
```

- [ ] **Step 2:** Rode os testes. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** Rode os testes. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: clicar numa peça pede a explicação`.

---

### Tarefa 9: Casca da página

**Files:**
- Create: `helper/web/index.html`, `style.css`, `core.js`, `app.js`, `vendor/three.module.min.js` (cópia)
- Test: `helper/web/tests/core.test.mjs`

**Interfaces:**
- Consumes: os comandos SSE da Tarefa 3 e o contrato `scenes/<tipo>.js` do Mapa de arquivos.
- Produces (`core.js`, sem DOM):

```js
export function stepMs(animMs, say, narrator)      // caption → max(animMs, 55 * say.length); page/jarvis → animMs (a voz é esperada à parte)
export function pickVoice(voices)                  // 'Microsoft Daniel' pt-BR → 'Microsoft Maria' pt-BR → primeira pt-BR → null
export class History { constructor(max = 5); push(item); current(); prev(); next(); }
export function nextAction(state, event)           // máquina de reprodução; ver testes
```

- Comportamento do `app.js`:
  - conecta `EventSource('/events?t=')`, com o token lido da query e guardado em memória;
  - ao receber `scene`, guarda no `History`, importa `scenes/<tipo>.js` dinamicamente e **começa a tocar sozinha** a partir de `from` (design §4.1, passo 5). Com o narrador `jarvis`, espera o primeiro `advance`;
  - ⏸ manda `paused{scene,step}`; ▶ com o narrador `jarvis` manda `resume{scene,step}` e espera o `advance`;
  - controles: ▶/⏸, ⟲, pontos de passo clicáveis, ← → do histórico e o interruptor 🔊 Narração / 💬 Legenda;
  - com o narrador `jarvis`, o interruptor fica desabilitado, com a dica `narrado pelo Jarvis`;
  - com o narrador `jarvis`, a página **não** avança sozinha: anima o passo pedido por `advance{step}` e manda `step-done` ao terminar;
  - com `page` ou `caption`, avança sozinha e também manda `step-done` a cada passo;
  - fala com `speechSynthesis` usando a voz de `pickVoice`;
  - `pause` corta a fala e para;
  - ao perder o SSE por mais de 5 s, mostra `viewer desligado — peça uma cena para religar`;
  - tema claro e escuro por `prefers-color-scheme`.

- [ ] **Step 1: Testes que falham** (`node --test helper/web/tests/core.test.mjs`):

```js
test('legenda espera pelo menos 55 ms por caractere', () => assert.equal(stepMs(1000, 'x'.repeat(40), 'caption'), 2200))
test('voz preferida é Daniel', () => assert.equal(pickVoice([{name:'Microsoft Maria - Portuguese (Brazil)',lang:'pt-BR'},{name:'Microsoft Daniel - Portuguese (Brazil)',lang:'pt-BR'}]).name.startsWith('Microsoft Daniel'), true))
test('sem pt-BR → null', () => assert.equal(pickVoice([{name:'X',lang:'en-US'}]), null))
test('histórico guarda só 5', ...)
test('jarvis: só avança com advance', ...)           // nextAction({narrator:'jarvis',step:0}, {type:'anim-done'}) não pede o passo 1
test('page: avança quando voz e animação terminam', ...)
test('reconexão recomeça no passo 1, pausada com jarvis', ...)
```

- [ ] **Step 2:** Rode os testes. Esperado: FAIL.
- [ ] **Step 3:** Implemente `core.js` e depois `app.js` e `index.html`. A casca deve funcionar com um `scenes/arquitetura.js` provisório que só resolve `play()` depois de 500 ms.
- [ ] **Step 4:** Rode os testes. Esperado: PASS. Depois abra a página servida pelo auxiliar (`python -m viewer` com `VIEWER_TOKEN=t`) no navegador embutido e confira que os controles, a legenda e o tema respondem.
- [ ] **Step 5:** Commit: `feat: casca da página do viewer`.

---

### Tarefa 10: Motor comum (stage e layout)

**Files:**
- Create: `helper/web/engine/stage.js`, `helper/web/engine/layout.js`
- Test: `helper/web/tests/layout.test.mjs`

**Interfaces:**
- Produces (`stage.js`):

```js
export function createStage(container, { theme }) → {
  THREE, scene, camera,
  addPiece(id, object3D, { label, sub, detail, color }),   // rótulo HTML projetado, dica com detail, clique → onPick(id)
  focus(ids),                                              // acende e pulsa; o resto escurece (como o rascunho)
  packet(fromVec3, toVec3, { color, arc = 1, delayMs = 0, ms = 1300 }) → Promise<void>,   // esfera com rastro de 8 partes num arco quadrático
  fit(box3, { planar = false }),                           // enquadra pelo FOV horizontal; planar = câmera frontal, sem órbita automática
  onPick(cb), clear(), dispose()
}
```

- Produces (`layout.js`, puro):

```js
export function row(n, gap)               → [x,y,z][]   // centrado na origem
export function grid(n, cols, gap)        → [x,y,z][]
export function layered(nodes, edges)     → Map<id,[x,y,z]>   // níveis por BFS a partir das fontes; ordem dentro do nível por baricentro
export function tree(nodes)               → Map<id,[x,y,z]>   // filhos espalhados sob o pai
export function bounds(points)            → { min:[x,y,z], max:[x,y,z] }
```

- Visual igual ao rascunho (`docs/rascunho/viewer-demo.html`): névoa `0.018`, estrelas, grade, `PointLight`, arrastar para girar, roda do mouse para o zoom, `setAnimationLoop` parado com a aba oculta.

- [ ] **Step 1: Testes que falham.**

```js
test('row centrado', () => assert.deepEqual(row(3, 4).map(p => p[0]), [-4, 0, 4]))
test('layered: nenhum par de nós a menos de 1,5 unidade', ...)    // 12 nós, 15 arestas
test('layered: aresta sempre desce de nível quando não há ciclo', ...)
test('layered: ciclo não trava', ...)                              // a→b→a termina
test('tree: filhos abaixo do pai e sem sobreposição', ...)
test('bounds', ...)
```

- [ ] **Step 2:** Rode os testes. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** Rode os testes. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: motor comum de cenas`.

---

### Tarefas 11–15: Os 10 tipos de cena

O molde é o mesmo para todas. Cada uma cria `scenes/<tipo>.js` com `build(scene, stage)` (contrato no Mapa de arquivos), cobre o layout ou a matemática do tipo com testes em `helper/web/tests/<tipo>.test.mjs` (função pura exportada pelo próprio arquivo, sem DOM) e termina com uma cena de exemplo em `docs/exemplos/<tipo>.json`. O exemplo é aberto no navegador embutido para conferência visual e precisa passar no `validateScene` (rode `claude plugin test .`, que inclui um teste que carrega todos os exemplos).

Passos de cada tarefa:
- [ ] **Step 1:** testes que falham;
- [ ] **Step 2:** `node --test`, esperado FAIL;
- [ ] **Step 3:** implementar;
- [ ] **Step 4:** `node --test`, esperado PASS, e conferir o exemplo no navegador embutido;
- [ ] **Step 5:** commit `feat: cena <tipos>`.

| Tarefa | Tipos | Como desenhar | Testes que pinam |
|---|---|---|---|
| 11 | `arquitetura`, `sequencia` | arquitetura: o rascunho, generalizado; `row` até 6 nós, `layered(nodes, links)` acima disso; formas por `shape`; arcos de ida em cima e de volta embaixo; `hops` viram `packet`. sequencia: atores em colunas com linhas de vida verticais; mensagens como setas horizontais em descida, na ordem; `highlight` revela a mensagem e manda um pacote; câmera `planar` | `arcSide(from,to)` (+1 para a direita, −1 para a esquerda); `sequenceY(i)` estritamente decrescente; `hops` numa aresta inexistente ainda animam (o design permite hop entre quaisquer ids) |
| 12 | `fluxo`, `estados`, `arvore` | fluxo: `layered`; `decisao` é losango; `inicio`/`fim` são pílulas; o marcador percorre `path` e as arestas rotuladas mostram o rótulo ao passar. estados: círculos num anel (`ringPositions(n)`); transições curvas; laço próprio como um toro pequeno; o marcador pula por `path`; `initial` ganha uma seta de entrada. arvore: `tree()`; os ramos brotam da raiz no primeiro passo; `highlight` acende o caminho da raiz até o nó | `ringPositions(n)` equidistantes; `pathEdges(path)` só com pares consecutivos; `rootPath(nodes, id)` = raiz → id |
| 13 | `grafico`, `timeline` | grafico: câmera frontal, relevo de no máximo 0,15 unidade; eixos com 5 marcas `niceTicks`; `barras` crescem do zero; `linhas` desenham da esquerda para a direita; `rosca` abre os setores; `dispersao` faz os pontos aparecerem; `highlight` `"serie#i"` destaca e mostra o valor com `unit`. timeline: linha horizontal; marcos na ordem dada; a câmera desliza até o marco do `focus`/`highlight` | `niceTicks(min,max)` inclui o 0 quando min > 0 ou max < 0; com min = max = 5, sem NaN e com intervalo positivo; `barBase(v) === 0` e altura `|v|`; negativos para baixo; `donutAngles` somam 2π; marcos sem sobreposição com 12 eventos |
| 14 | `camadas`, `comparacao` | camadas: placas empilhadas (de cima para baixo), com `items` como etiquetas; o `focus` afasta as placas acima e abaixo; `hops` sobem ou descem entre placas. comparacao: duas colunas com título; itens alinhados por índice; `value` numérico desenha uma barra comparável entre os lados (mesma escala); `highlight` pulsa o item e o par dele | `layerY(i, n)` decrescente; `pairOf(sides, id)` acha o item de mesmo índice no outro lado; `sharedScale` usa o máximo absoluto dos dois lados |
| 15 | `metafora` | `objects` viram primitivas (`texto` é um rótulo HTML, `particulas` é um `Points` com 200 pontos em volta de `pos`); `actions` do passo rodam em paralelo; `mover`/`seguir` usam `ms` (padrão 1200); `aparecer`/`sumir` animam a escala; `pulsar` repete 3 vezes; `girar` dá uma volta | `actionDuration(actions)` = máximo dos `ms` (padrão 1200); `lerpPath(path, t)` passa pelos pontos; uma ação com `target` inexistente é ignorada (o validador já recusa, mas a página não pode quebrar) |

Para a Tarefa 15, estenda também `validateScene` (Tarefa 2): `pos` com 3 números finitos, `|x|,|y|,|z| ≤ 20`, `ms` entre 100 e 10000, cor no formato `#rrggbb`. Adicione os testes em `hooks/scene.test.ts`.

---

### Tarefa 16: Integração com o Jarvis — lado do viewer

**Files:**
- Create: `hooks/jarvis.ts`
- Modify: `hooks/register.tsx`, `types/index.d.ts` (a chave do Jarvis, se o spike mostrou que é preciso)
- Test: `hooks/jarvis.test.ts`

**Interfaces:**
- Consumes:
  - canal (Tarefa 1): lê `{plugin:'modo-conversa', key:'mode'}` (`'on'` = Jarvis ligado nesta sessão) e observa `state.set` em `{plugin:'modo-conversa', key:'said'}`, cujo valor é `{ id: string; outcome: 'done' | 'stopped' } | null`;
  - escreve `{plugin:'jarvis-viewer', key:'say'}` = `{ id, text }` e `{plugin:'jarvis-viewer', key:'playing'}` = `boolean`.
- Produces:

```ts
export class JarvisLink {
  constructor($: EngineInterface)
  isOn(): Promise<boolean>
  say(text: string, timeoutMs = 30000): Promise<'done' | 'stopped' | 'timeout'>   // id = crypto.randomUUID()
  setPlaying(on: boolean): Promise<void>
}
export async function narrateWithJarvis(link, send, scene, from, waitStepDone): Promise<'ended' | 'stopped' | 'fallback'>
```

- Laço por passo de `narrateWithJarvis`:
  1. manda `{type:'advance', step:i}`;
  2. espera **ao mesmo tempo** `link.say(step.say)` e o `step-done{step:i}` da página;
  3. com `stopped`, manda `{type:'pause'}` e termina com `'stopped'`;
  4. com `timeout`, ou se `isOn()` virar `false` antes do próximo passo, manda `{type:'mode', narrator:'page'|'caption', from:i+1}` e `{type:'caption', text:'narrando pela página'}`, e termina com `'fallback'`.
- `setPlaying(true)` no início da cena e `setPlaying(false)` em qualquer saída. Mesmo que o laço quebre, `playing` termina `false`.
- `mostrar_cena` passa a escolher o narrador com `chooseNarrator(await link.isOn(), narrationOn(...))`. Com `jarvis`, o laço começa quando houver página conectada (`page-open`), sem bloquear o resultado da ferramenta.

- [ ] **Step 1: Testes que falham.** Simule o Jarvis no `testkit`: um hook `state.set` em `jarvis-viewer/say` responde, num `$.clock.after`, com o valor `said`. Use o mecanismo que o spike validou para a resposta chegar ao mod.

```ts
test('Jarvis ligado: narrador jarvis e passos avançam pelo said', ...)       // 3 passos → advance 0,1,2 em ordem; say com os textos dos passos
test('stopped pausa a cena', ...)                                            // said stopped no passo 1 → cmd pause; playing false
test('Jarvis desliga no meio → página assume do passo seguinte', ...)        // mode narrator 'page' from 2 + caption 'narrando pela página'
test('sem resposta em 30 s → fallback', ...)
test('Jarvis em outra sessão (mode off aqui) → narrador da opção', ...)
test('playing volta a false mesmo com erro', ...)
test('⏸ na página durante a narração do Jarvis encerra o laço e libera o resumo', ...)   // evento paused → sem novos say; playing false
test('▶ depois de pausar retoma do passo pausado', ...)                                  // evento resume step 2 → advance 2 e say do passo 2
```

- [ ] **Step 2:** Rode os testes. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** Rode os testes. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat: narração pelo Jarvis`.

---

### Tarefa 17: mods-jarvis — a página avisa quando terminou de falar

**Repositório mods-jarvis**, branch `feat/viewer-integration`, a partir de `main`. Os commits desta tarefa e da seguinte ficam só nesse branch.

**Files:**
- Modify:
  - `helper/conversa/server.py`: acrescentar `spoken` a `PAGE_EVENTS`;
  - `helper/web/conversa.js`: a fila de reprodução lê o `id` opcional de cada bloco de `speak`;
  - `hooks/helper.ts`: acrescentar `{ type: 'spoken'; id: string; outcome: 'done' | 'stopped' }` ao `HelperEvent`.
- Test: `helper/tests/test_server.py`, `helper/web/tests/voicecore.test.mjs` (se a lógica da fila estiver em `voicecore.js`; senão, extraia a decisão "este bloco terminou ou foi cortado" para uma função pura em `voicecore.js` e teste-a lá)

**Interfaces:**
- Produces:
  - o comando `{type:'speak', turn, chunks, ids?: (string|null)[]}`, com `ids[i]` correspondendo a `chunks[i]`;
  - o evento de página `{type:'spoken', id, outcome}`, mandado quando o bloco com id acaba de tocar (`done`) ou é descartado por `flush`/"pare" (`stopped`);
  - um `speak` sem `ids` se comporta exatamente como hoje.

- [ ] **Step 1: Testes que falham.**
  - pytest: `POST /event {"type":"spoken","id":"a","outcome":"done"}` → stdout com o mesmo objeto;
  - `node --test`: a função pura `settle(queue, event)` devolve os `spoken` esperados para fim de bloco e para flush com 2 blocos pendentes, que dá 2 `stopped`.
- [ ] **Step 2:** Rode `cd helper && python -m pytest -q` e `node --test helper/web/tests/voicecore.test.mjs`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** Rode os testes do mods-jarvis (`pytest`, `node --test`, `claude plugin test .`). Esperado: tudo verde, inclusive os testes antigos.
- [ ] **Step 5:** Commit no mods-jarvis: `feat: a página avisa quando um bloco falado termina`.

---

### Tarefa 18: mods-jarvis — fala as frases da cena e segura o resumo

**Files (mods-jarvis):**
- Modify: `types/index.d.ts`, que ganha `said: { id: string; outcome: 'done' | 'stopped' } | null` em `PluginState['modo-conversa']`; `hooks/register.tsx`; `hooks/conversation.ts`
- Test: `hooks/viewer.test.ts`

**Interfaces:**
- Consumes:
  - o canal da Tarefa 1: observa `state.set` em `{plugin:'jarvis-viewer', key:'say'}` e em `{plugin:'jarvis-viewer', key:'playing'}`;
  - os ids de `speak` e o evento `spoken` da Tarefa 17.
- Produces:
  - Com o Jarvis ligado, cada `say` novo vira `speak` com `chunks:[text]` e `ids:[id]`, **na fila depois** do que já está tocando. Ao chegar `spoken` daquele id, o Jarvis escreve `said = { id, outcome }`.
  - Com o Jarvis desligado, um `say` é respondido na hora com `said = { id, outcome: 'stopped' }`, para o viewer cair para a página.
  - **Segurar o resumo**: enquanto `playing` for `true`, os blocos da resposta do Claude que viriam de `turn.step` depois de um `tool.call` de `mcp__jarvis-viewer__mostrar_cena` ficam guardados em `conversation.held`. Quando `playing` vira `false`, eles são enviados em ordem. Um "pare" descarta `held`.
  - "Pare": o fluxo atual (`flush` + abort) continua igual. Os `spoken stopped` que a página manda viram `said stopped`.

- [ ] **Step 1: Testes que falham** (no estilo de `hooks/speech.test.ts`, usando o `world()` do mods-jarvis):

```ts
test('say do viewer vira speak com id e said done no spoken', ...)
test('say com Jarvis desligado responde stopped na hora', ...)
test('texto depois de mostrar_cena fica guardado até playing false', ...)  // ordem: abertura falada; resumo só depois de playing=false
test('pare descarta o guardado e responde stopped', ...)
test('sem viewer instalado nada muda', ...)                                 // todos os testes antigos continuam passando
```

- [ ] **Step 2:** Rode `claude plugin test .` no mods-jarvis. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** Rode `claude plugin validate .`, `tsc -p .`, `claude plugin test .`, `pytest` e `node --test` no mods-jarvis. Esperado: tudo verde.
- [ ] **Step 5:** Commit no mods-jarvis: `feat: integração com o Jarvis Viewer`. Regere o `bin/conversa-helper.exe` com `scripts/build-helper.ps1` (o `server.py` mudou) e faça um commit separado: `build: auxiliar com o evento spoken`. Não faça push.

---

### Tarefa 19: Empacotamento, ponta a ponta e README

**Files:**
- Create: `scripts/build-helper.ps1` (adaptado: sem dependências de runtime, `--name viewer-helper`, `--add-data web;web`), `scripts/smoke.py`, `bin/viewer-helper.exe`
- Modify: `README.md` (status `em design` → `beta`; seção Desenvolvimento com os comandos reais), `docs/superpowers/specs/...` (marcar o status como "implementado")
- Test: `scripts/smoke.py`

**Interfaces:**
- `smoke.py` faz o seguinte:
  1. sobe o exe com `VIEWER_TOKEN`;
  2. lê o `ready`;
  3. manda a cena de exemplo de `arquitetura` por `/cmd`;
  4. abre a página num Edge headless (`msedge --headless=new --remote-debugging-port=0 --user-data-dir=<tmp>`), conecta pelo protocolo DevTools com `urllib` + `websocket`, ou usa `--dump-dom` com espera;
  5. confere que o `<canvas>` existe e que chega ao stdout `step-done` do passo 0;
  6. encerra.
  Ele imprime `OK` e sai com 0.

- [ ] **Step 1:** Rode `powershell -ExecutionPolicy Bypass -File scripts/build-helper.ps1`. Esperado: `bin\viewer-helper.exe` com menos de 15 MB.
- [ ] **Step 2:** Rode `.venv-build\Scripts\python.exe scripts\smoke.py`. Esperado: `OK`.
- [ ] **Step 3:** Rode a bateria toda: `claude plugin validate .`, `tsc -p .`, `claude plugin test .`, `cd helper && python -m pytest -q` e `node --test helper/web/tests`. Esperado: tudo verde.
- [ ] **Step 4:** Atualize o README e rode a busca pelo nome do empregador com `git grep -i`. Esperado: nada.
- [ ] **Step 5:** Commit: `build: auxiliar empacotado, smoke e README`.

---

### Tarefa 20: Verificação pelo dono

Sem código. Instale os dois mods a partir das pastas (`claude --plugin-dir ..\mods-jarvis --plugin-dir .`) e peça ao dono:

- [ ] Uma explicação de cada um dos 10 tipos (use `docs/exemplos/*.json` via "mostre o exemplo X no viewer").
- [ ] `IA escolhe`: uma pergunta de sim ou não não abre o viewer; "como funciona X" abre.
- [ ] `Sob demanda`: nada abre sozinho; `/viewer` e "mostra num desenho" abrem.
- [ ] Interruptor Narração / Legenda; fechar e abrir uma sessão e conferir que a escolha ficou salva.
- [ ] Jarvis ligado: a voz é a do Jarvis, os passos acompanham a fala, o resumo vem depois da cena e "pare" pausa a cena e o turno.
- [ ] Clicar numa peça durante e depois de um turno.
- [ ] Duas sessões ao mesmo tempo, cada uma com a sua cena.

Ao final, com o aval do dono: fast-forward de `feat/viewer-v1` em `main` no viewer e de `feat/viewer-integration` em `main` no mods-jarvis. O push fica para quando o dono pedir.
