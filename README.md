# 🧊 Jarvis Viewer para o Claude Code

**Veja o que o Claude explica.** Quando um conceito, uma arquitetura ou um resultado fica mais claro desenhado, o Claude monta uma cena animada em 3D, passo a passo, e a mostra ao lado do chat, narrada em voz alta ou com legenda.

![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)
![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6)
![Claude Code](https://img.shields.io/badge/Claude%20Code-mod-D97757)
![Status](https://img.shields.io/badge/status-em%20design-orange)

> 🚧 **Em design.** Este README descreve o que o mod vai fazer. O código ainda não foi escrito.

## Por quê

Pessoas entendem melhor vendo como as coisas funcionam. Um parágrafo sobre "o auxiliar repassa o texto ao mod, que envia o prompt" vira uma cena em que você vê o dado sair de uma peça e chegar na outra, no mesmo ritmo da explicação.

## Recursos

- **Cenas animadas em three.js** no navegador embutido do app desktop, ao lado da conversa.
- **Passo a passo narrado**: cada passo da cena acende as peças da vez e avança junto com a frase.
- **Integra com o [Modo Jarvis](https://github.com/niuarque-br/mods-jarvis)**: com o Jarvis ligado, é ele quem narra, com a voz dele, e a cena acompanha a fala.
- **Narração ou legenda** num interruptor na própria tela.
- **Clique numa peça** para o Claude explicar aquela parte.
- **Sob demanda ou por iniciativa do Claude**: você escolhe nas opções.

## Tipos de cena

| Tipo | Serve para |
|---|---|
| Arquitetura | peças de um sistema e como conversam |
| Fluxo | processos com decisões e repetições |
| Gráfico | resultados: barras, linhas, rosca, dispersão |
| Timeline | eventos ao longo do tempo |
| Sequência | quem chama quem, e em que ordem |
| Estados | algo que muda de modo e as transições entre eles |
| Camadas | pilhas e níveis (rede, aplicação, dados) |
| Árvore | hierarquias: pastas, organogramas, decomposição |
| Comparação | opção A contra opção B |
| Metáfora | conceitos abstratos (fila, cache, concorrência) como objetos |

Arquitetura, camadas e metáfora usam profundidade de verdade. Gráficos e timelines ficam quase planos, para os números não enganarem a leitura.

## Requisitos

- Windows 10 ou 11.
- Claude Code **app desktop** (o viewer abre no navegador embutido dele).
- Opcional: [Modo Jarvis](https://github.com/niuarque-br/mods-jarvis), para narração com a voz do Jarvis.

## Instalar

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install jarvis-viewer --marketplace niuarque-br/mods-jarvis-viewer
```

Ou, de um shell:

```bash
claude plugin install jarvis-viewer --marketplace niuarque-br/mods-jarvis-viewer
```

Depois abra uma sessão nova ou rode `/reload-plugins`.

## Usar

- **Sob demanda**: digite `/viewer`, peça "mostra num desenho" ou, com o Jarvis ligado, diga isso em voz alta.
- **Claude escolhe**: o Claude abre o viewer sozinho quando um desenho ajuda. Respostas curtas e ajustes pontuais continuam só em texto.
- Na tela: **▶** reproduz, **⟲** recomeça, e o interruptor **🔊 Narração / 💬 Legenda** troca o modo. Arraste para girar a cena.
- Peça "de novo" ou "volta no passo 3" para rever a última cena.

## Opções

Pelo `/config` de um terminal (opções do plugin `jarvis-viewer`), ou pelo painel do mod [mods-config](https://github.com/niuarque-br/mods-config) no app desktop:

| Opção | Padrão | Para quê |
|---|---|---|
| Apresentação | `IA escolhe` | `IA escolhe`: o Claude abre quando um desenho ajuda; `Sob demanda`: só quando você pede |
| Narração | `ligada` | `ligada` narra em voz alta; `desligada` mostra só a legenda. Também muda pela tela do viewer |

Com o Jarvis ligado, a narração sai sempre pelo Jarvis, qualquer que seja essa opção.

## Como funciona

```
Claude Code ── mod (hooks/register.tsx) ──┬── ferramenta "mostrar cena", opções, integração com o Jarvis
                                          │
                                          ▼
                    servidor local 127.0.0.1 (token por sessão)
                                          │
                                          ▼
          navegador embutido do app: página three.js (cena, passos, narração)
```

- O **mod** sobe um servidor local pequeno e dá ao Claude uma ferramenta para mandar cenas: peças, ligações e passos narrados.
- O **Claude** abre a página ao lado do chat na primeira vez. Depois a página se atualiza a cada cena nova.
- A **página** desenha a cena em three.js, avança os passos e narra ou mostra a legenda. Com o Jarvis ligado, ela segue a fala dele.

## Créditos

- Cenas 3D feitas com [three.js](https://threejs.org) (MIT).

## Licença

[MIT](LICENSE) © 2026 Niuarque Batista
