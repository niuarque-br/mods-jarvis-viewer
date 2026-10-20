const BASE = `Viewer: a ferramenta mostrar_cena (mcp__jarvis-viewer__mostrar_cena) mostra uma explicação como cena animada no navegador embutido do app desktop.
Use para: conceito com partes, arquitetura, fluxo, sequência de passos, evolução no tempo, resultado numérico.
Não use para: resposta curta, ajuste pontual, pergunta de sim ou não.
No chat: uma frase curta antes, a cena, um resumo curto depois, sem repetir os passos.
Se o resultado pedir para abrir o endereço, chame preview_start com esse url.`

const AUTO = `Decida sozinho quando uma cena ajuda mais do que texto.`
const ON_DEMAND = `Use o viewer só quando o usuário pedir (por exemplo com /viewer ou "mostre no viewer"); sem pedido, responda só com texto.`

/** Text added to every prompt.compose; an unknown value counts as "IA escolhe". */
export function guidance(presentation: string): string {
  return `${BASE}\n${presentation === 'Sob demanda' ? ON_DEMAND : AUTO}`
}

/** What /viewer submits as the user's message. */
export function viewerPrompt(args: string): string {
  const subject = args.trim()
  return subject === '' ? 'Mostre no viewer a explicação anterior.' : `Explique ${subject} mostrando no viewer.`
}
