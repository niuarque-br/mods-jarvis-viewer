const INTRO = `Viewer: a ferramenta mostrar_cena (mcp__jarvis-viewer__mostrar_cena) mostra uma explicação como cena animada no navegador embutido do app desktop.`
const CHAT = `No chat: uma frase curta antes, a cena, um resumo curto depois, sem repetir os passos.
Se o resultado pedir para abrir o endereço, chame preview_start com esse url.`

const AUTO = `Use para: conceito com partes, arquitetura, fluxo, sequência de passos, evolução no tempo, resultado numérico.
Não use para: resposta curta, ajuste pontual, pergunta de sim ou não.
Decida sozinho quando uma cena ajuda mais do que texto.`
// The criteria only shape a scene the user asked for; they never invite one.
const ON_DEMAND = `Use o viewer só quando o usuário pedir (por exemplo com /viewer ou "mostre no viewer"); sem pedido, responda só com texto.
Quando ele pedir, monte a cena do que foi pedido: conceito com partes, arquitetura, fluxo, sequência de passos, evolução no tempo ou resultado numérico.`

// Figures: how to find, pick and combine them; the owner's explicit request always wins.
const FIGURAS = `Figuras: dê a cada peça uma figura do assunto com buscar_figura (conceito em português ou inglês; uma opção por peça). Um estilo dominante por cena: fluent/3d para coisas e pessoas, tabler/outline ou phosphor/duotone para conceitos. estilo.figuras só informa esse estilo (dica; não muda nada). Evite tom: escura; na dúvida, fique na forma geométrica. Se buscar_figura disser que não há figuras instaladas, siga sem figuras.
Em pedido explícito do dono, ele vence: "use caixas" vira estilo.forma (e tire shape e figura das peças, senão nada muda), "árvore deitada" vira estilo.arranjo "horizontal" (só arvore, fluxo, camadas). Movimentos (em 1 ou 2 peças): girar, pulsar, balancar, subir, respirar, piscar.`

/** Text added to every prompt.compose; an unknown value counts as "IA escolhe". */
export function guidance(presentation: string): string {
  return `${INTRO}\n${presentation === 'Sob demanda' ? ON_DEMAND : AUTO}\n${FIGURAS}\n${CHAT}`
}

/** What /viewer submits as the user's message. */
export function viewerPrompt(args: string): string {
  const subject = args.trim()
  return subject === '' ? 'Mostre no viewer a explicação anterior.' : `Explique ${subject} mostrando no viewer.`
}
