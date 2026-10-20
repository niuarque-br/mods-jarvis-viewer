# Spike: canal entre mods, superfície e navegador embutido

Build: Claude Code 2.1.304. Mods descartáveis `spike-a` e `spike-b` ficaram no scratchpad, fora dos repositórios.

## Resultados

| Pergunta | Resultado | Evidência |
|---|---|---|
| `spike-a` valida com `PluginState['spike-a'].say` no `types/index.d.ts`? | Sim, desde que o `.d.ts` exporte só tipos (um `export {}` no topo é recusado) | `claude plugin validate spike-a`: `types ... declares state: spike-a.say`; com `export {}`: `a contract exports types and nothing else` |
| `spike-b` valida citando a chave de outro plugin, sem `dependencies` e sem declarar a chave? | Sim, passa (só avisos) | `Validation passed with warnings`; lista `state reads: spike-a.say` e `state of other plugins, not checked (run validate in a session with them enabled): spike-a.say`; `gating hook without .catch: state.set{plugin=spike-a, key=say}` é um fato, não um erro |
| `spike-b` valida declarando a chave no próprio `types/index.d.ts`? | Sim, mesmo resultado | `spike-b2` (cópia com o `declare module 'claude-code' { interface PluginState { 'spike-a': ... } }`): `Validation passed with warnings` |
| Um plugin observa o `$.state.set` de outro com `on('state.set', { plugin, key }, ...)`? | Sim: o hook dispara com `e.value` = `{"id":"1","text":"oi"}` | `claude plugin test spike-ab`: `TOASTS ["viu {\"id\":\"1\",\"text\":\"oi\"}"]` e o arquivo gravado pelo hook com o mesmo texto |
| `$.state.get({plugin:'spike-a',key:'say'})` lê o valor do outro? | Sim, devolve `{ value, version }` | mesmo teste: `READ -> leu {"value":{"id":"1","text":"oi"},"version":1}` |
| Limites vistos nos tipos | Só o dono escreve (`$.state.set` de chave alheia é recusado; para mudar, interceptar o `state.set` e reescrever `e.value`). `plugin` e `key` têm de ser literais no fonte. `hooks.json` aceita um único módulo por plugin. | `claude-code.d.ts` (doc de `state.set`/`state.get`); `modules: ... a second entry is refused` |
| `$.session.surfaces()` inclui `desktop`? | Não verificado: a sessão `claude -p` falhou na autenticação (`Failed to authenticate: OAuth session expired`), então nenhum hook rodou. A verificar na Tarefa 20; regra: se `surfaces()` incluir `desktop` ou o resultado não estiver disponível, tratar como desktop. | saída do `claude -p --plugin-dir spike-a --plugin-dir spike-b "/spike-say"` |
| `preview_start` com `url` abre `http://127.0.0.1:47821/` sem pedir aprovação? | Abriu sem pedir aprovação (sessão atual; não testado numa sessão nova). | `preview_start` com url `http://127.0.0.1:47821/` |
| Página em aba de segundo plano por 30 s | `document.hidden` continuou false; `setInterval(20)` seguiu ~50 Hz (153→1636 ticks); SSE seguiu (14→75 mensagens); `requestAnimationFrame` PAROU (58→58 quadros). Consequência: na página, o fim de passo e de pacote é medido por relógio (`setTimeout`/`performance.now`), nunca por contagem de quadros. | página de teste com contadores, 30 s com a aba escondida |

## Como foi provado (e o limite da prova)

Uma sessão real com dois `--plugin-dir` não rodou (autenticação expirada no `claude -p`). Duas provas com `claude plugin test`, ambas com asserções (`expect`):

1. Dois plugins distintos: o teste fica na pasta de `spike-a` (plugin sob teste, dono de `spike-a.say`, comando `/spike-say`) e carrega `spike-b` como plugin inline (`test(nome, { plugins: [spikeB] }, ...)`, nome `spike-b`, com `on('state.set', { plugin:'spike-a', key:'say' })` que grava o valor e o comando `/spike-read` com `$.state.get`). Asserções: o valor que o observador viu é `{"id":"1","text":"oi"}` e `$.state.get` devolve `{ value: {id:'1',text:'oi'}, version: 1 }`. Saída: `(pass) dois plugins distintos: b observa e le o state de a`, `1 pass, 0 fail`.
2. Um plugin só (`spike-ab`, writer e observador no mesmo módulo), mesmas asserções: `(pass) spike-b observa state.set de spike-a e le o valor`.

O que não foi provado: dois `--plugin-dir` independentes numa sessão real (cada um com seu manifesto e `types`); isso fica para a Tarefa 20.

## Decisão

O canal por `state.set` funciona, inclusive entre dois plugins distintos no kit de testes: é o canal das Tarefas 16 a 18. O Jarvis (dono de `modo-conversa`) e o viewer (dono de `jarvis-viewer`) escrevem só nas próprias chaves; o outro lado observa com `on('state.set', { plugin, key }, ...)` e lê com `$.state.get`, citando a chave por literal (declarar a chave do outro no próprio `types/index.d.ts` é opcional para a validação). A Tarefa 20 confirma numa sessão real com os dois plugins instalados. Se não se enxergarem, volta-se à alternativa (a) (rota HTTP do auxiliar do Jarvis, porta 47811, `viewer-link.json`), que não será construída agora.
