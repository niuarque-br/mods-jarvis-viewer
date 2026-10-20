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

Uma sessão real com dois `--plugin-dir` não rodou (autenticação expirada no `claude -p`). A prova foi um `claude plugin test` sobre `spike-ab`: um único plugin chamado `spike-a` cujo módulo registra o comando `/spike-say` (faz `$.state.set` em `spike-a.say`) e também os hooks do `spike-b` (`on('state.set', { plugin:'spike-a', key:'say' })` com `$.ui.toast` e `$.fs.write`, e o comando `/spike-read` com `$.state.get`). Isso prova o roteamento do evento `state.set` pelo motor e a leitura de `state.get`. Não prova a regra "só o dono escreve" entre dois plugins distintos nem a visibilidade entre dois `--plugin-dir`; isso fica para a Tarefa 20 (sessão real no app).

## Decisão

O canal por `state.set` funciona: é o canal das Tarefas 16 a 18. O Jarvis (dono de `modo-conversa`) e o viewer (dono de `jarvis-viewer`) cada um escreve só nas próprias chaves. O outro lado observa com `on('state.set', { plugin, key }, ...)` e lê com `$.state.get`, citando a chave por literal; declarar a chave do outro no próprio `types/index.d.ts` é opcional para a validação. A alternativa (a) (rota HTTP do auxiliar do Jarvis, porta 47811, `viewer-link.json`) não será construída. Se a Tarefa 20 mostrar que dois plugins reais não se enxergam, volta-se à alternativa (a).
