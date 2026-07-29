<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/wordmark-dark.svg">
    <img src="docs/assets/brand/wordmark-light.svg" alt="Applye" width="250" height="56">
  </picture>
</p>

<div align="center">

[English](README.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Українська](README.uk.md) | [Polski](README.pl.md)

</div>

<p align="center">
  <em>Las empresas usan IA para filtrar candidatos. Applye da a los candidatos un escritorio para responder.</em><br>
  <strong>Redactar está automatizado. Enviar, no.</strong>
</p>

<p align="center">
  <img src="docs/assets/hero-banner.png" alt="Applye - dashboard con candidaturas activas, seguimientos vencidos y entrevistas próximas" width="800">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.29.0-4F5BFF?style=flat" alt="Versión 0.29.0">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="Licencia MIT">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat&logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Angular-21-DD0031?style=flat&logo=angular&logoColor=white" alt="Angular">
  <img src="https://img.shields.io/badge/Rust-2021-000000?style=flat&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/SQLite-local--first-003B57?style=flat&logo=sqlite&logoColor=white" alt="SQLite">
  <br>
  <img src="https://img.shields.io/badge/Sin_cuenta-necesaria-2ea44f?style=flat" alt="Sin cuenta">
  <img src="https://img.shields.io/badge/Sin_telemetría-nunca-2ea44f?style=flat" alt="Sin telemetría">
  <img src="https://img.shields.io/badge/Tu_IA-tus_claves-4F5BFF?style=flat" alt="Trae tu propia IA">
</p>

<p align="center">
  <a href="https://applye.dev">Sitio web</a> ·
  <a href="https://applye.dev/docs">Documentación</a> ·
  <a href="https://applye.dev/methodology">Metodología</a> ·
  <a href="ROADMAP.md">Hoja de ruta</a> ·
  <a href="CHANGELOG.md">Registro de cambios</a>
</p>

---

<p align="center">
  <img src="docs/assets/demo.gif" alt="Demo de Applye - pega una oferta, recibe un chequeo de reclutador, adapta el CV, haz seguimiento" width="800">
</p>

**Applye** es una aplicación de escritorio open source y local-first para una búsqueda de empleo
asistida por IA. Puntúa ofertas contra tu perfil, adapta tu CV a cada vacante, redacta cartas de
presentación y mensajes de seguimiento, te prepara para entrevistas y gestiona todo el pipeline -
todo en tu máquina. Sin nube, sin cuenta, sin telemetría. Tú traes la IA que ya pagas, y cada envío
sigue siendo una decisión humana.

Construida primero para el mercado alemán/europeo, útil en cualquier lugar.

## Índice

- [Por qué Applye](#por-qué-applye)
- [Funciones](#funciones)
- [Inicio rápido](#inicio-rápido)
- [Uso: el flujo principal](#uso-el-flujo-principal)
- [Cómo funciona](#cómo-funciona)
- [Dónde busca Discover](#dónde-busca-discover)
- [Capturas de pantalla](#capturas-de-pantalla)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Stack tecnológico](#stack-tecnológico)
- [Hoja de ruta](#hoja-de-ruta)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Contribuir](#contribuir)
- [Sobre el autor](#sobre-el-autor)
- [También open source](#también-open-source)
- [Aviso legal](#aviso-legal)
- [Licencia](#licencia)
- [Contacto](#contacto)

## Por qué Applye

**Aumentar, no automatizar.** Este es el primer principio, y todo lo demás se pliega a él.

La IA asiste. Tú decides. Applye nunca enviará ni presentará nada automáticamente en tu nombre.
Puntúa, redacta y sugiere - y luego te devuelve el control. Cada salida de la IA es una propuesta
que lees, editas y aceptas o descartas. Ningún agente en segundo plano te representa en silencio
ante un reclutador.

Por qué importa:

- Un reclutador o hiring manager es una persona, y la relación es tuya, no de un bot.
- Las candidaturas automatizadas en masa son ruido; la idea es una herramienta que te ayude a enviar
  _menos y mejores_ candidaturas.
- Sigues siendo responsable de cada palabra que sale con tu nombre.

Si una función exige renunciar a ese control, no se publica.

## Funciones

| Función                                 | Qué hace                                                                                                                                                                                                       | Tokens       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Dashboard**                           | Una pantalla con la salud de tu pipeline, seguimientos pendientes y actividad reciente.                                                                                                                        | 0            |
| **Discover**                            | Escanea tus fuentes configuradas (Remotive, Himalayas, feeds RSS, portales Greenhouse, Lever, Ashby) por HTTPS, filtra por palabras clave y geografía en local, y muestra una puntuación de encaje por oferta. | 0            |
| **Pipeline de pegado**                  | Pega cualquier oferta; Applye extrae empresa, puesto, salario e idioma, ejecuta un chequeo determinista de legitimidad (señales de ofertas fantasma y estafas) y archiva la vacante.                           | 0            |
| **Chequeo de reclutador**               | Una lectura opcional con IA de la oferta frente a tu perfil: puntuación de encaje, palabras clave ausentes, señales de alerta y un veredicto directo antes de invertir tiempo.                                 | opcional     |
| **Adaptación del CV**                   | Un flujo de adaptación multi-pasada que ajusta tu perfil a la vacante - revisas cada cambio - exportado a PDF.                                                                                                 | opcional     |
| **Cartas de presentación**              | Un borrador de carta por vacante, construido a partir de tu perfil y la oferta, listo para revisar y exportar. Tú editas, tú envías.                                                                           | opcional     |
| **Kanban de pipeline**                  | Aplicado, entrevista, oferta - arrastra las vacantes entre etapas; el historial de estados se registra solo.                                                                                                   | 0            |
| **Seguimiento y follow-ups**            | Cada candidatura con fechas, estados, notas y borradores de seguimiento cuando una oferta se queda en silencio.                                                                                                | 0 / opcional |
| **Preparación de entrevistas**          | Una línea de tiempo de etapas de entrevista por candidatura - fechas, entrevistadores, estados y tus notas.                                                                                                    | 0            |
| **Analítica**                           | Conversión del embudo, antigüedad del pipeline, desglose de dónde aplicas - calculado en local con tus propios datos.                                                                                          | 0            |
| **Herramientas para el mercado alemán** | Informe de Eigenbemühungen para la Agentur für Arbeit, documentos en alemán, información sobre la Blue Card.                                                                                                   | 0 / opcional |
| **Interfaz multilingüe**                | Inglés, alemán, ruso, español, francés, ucraniano.                                                                                                                                                             | 0            |

La columna "Tokens" es un contrato de diseño: todo lo marcado con **0** funciona completamente
offline con código determinista. La IA solo se gasta donde el juicio es realmente necesario, y solo
cuando tú haces clic.

## Inicio rápido

### Descargar

**[Descargar para macOS (Apple Silicon)](https://github.com/vitala89/applye/releases/latest)** - `.dmg`, 15 MB.

Las versiones para Windows, Linux y macOS Intel aún no están publicadas: las produce el flujo de
release, que no puede ejecutarse hasta que se resuelva la facturación de GitHub Actions de este
repositorio. Mientras tanto, [compila desde el código fuente](#inicio-rápido): son tres comandos y
funcionan en las tres plataformas.

> La versión de macOS no está firmada con un certificado de Apple Developer, así que el primer
> arranque requiere clic derecho sobre la app y **Abrir** en lugar de doble clic. Las
> [notas de la versión](https://github.com/vitala89/applye/releases/latest) lo explican y dan la alternativa en una línea.

### Compilar desde el código fuente

**Requisitos:** Node 20+, Rust (stable, edición 2021) y las
[dependencias de sistema de Tauri 2](https://v2.tauri.app/start/prerequisites/) para tu SO.

```bash
git clone https://github.com/vitala89/applye.git
cd applye
npm install

npm run desktop:dev      # lanza la app Tauri + Angular en modo desarrollo
```

Otros scripts útiles:

```bash
npm run desktop:build    # build de producción de la app de escritorio
npm run web:dev          # ejecuta el sitio applye.dev en local
npm test                 # ejecuta la suite de tests
npm run lint             # lint de todos los proyectos
npm run type-check       # comprobación de tipos de todos los proyectos
```

Las funciones de IA están desactivadas hasta que añadas una clave o un puente CLI en **Ajustes**.
La app es totalmente usable sin ellas.

## Uso: el flujo principal

1. **Pega** una oferta de empleo (o deja que **Discover** traiga vacantes de tus fuentes).
2. **Chequea** - una pasada determinista de legitimidad y, opcionalmente, una lectura de reclutador con IA.
3. **Adapta** - una adaptación multi-pasada del CV que revisas línea a línea, exportada a PDF.
4. **Aplica** - tú copias, tú abres la vacante, tú envías. Applye lo registra; nunca hace clic por ti.
5. **Sigue** - la vacante avanza por el kanban; aparecen borradores de seguimiento cuando hay silencio.
6. **Prepárate** - sigue cada etapa de entrevista en una línea de tiempo y guarda tus notas por oferta.

<p align="center">
  <a href="https://applye.dev/docs/guide/tour/">
    <img src="docs/assets/walkthrough-thumb.png" alt="Ver el recorrido de la primera ejecución de Applye" width="800">
  </a>
  <br>
  <em>Un recorrido silencioso por las seis pantallas del primer arranque, en applye.dev.</em>
</p>

## Cómo funciona

**Local-first y privado.** Tu perfil, lista de ofertas, notas y documentos generados viven en una
base de datos SQLite local en tu máquina. Los flujos principales funcionan sin red. Sin cuentas, sin
telemetría, sin sincronización en la nube. Nada de tu búsqueda sale del dispositivo salvo que _tú_
lances una llamada de IA, y aun entonces solo se envía lo mínimo para esa petición. Compatible con
el RGPD porque no hay nada que filtrar - no existe un servidor con tus datos.

**Trae tu propia IA.** Applye no incluye un modelo ni revende tokens. Conectas la IA que ya pagas:

- **Clave API** - apunta Applye a la API de un proveedor (Anthropic Claude, OpenAI, Google Gemini, DeepSeek) con tu propia clave.
- **Puente CLI** - o enruta a través de una CLI de IA local que ya tengas (Claude Code, Codex, Gemini CLI).

En ambos casos las claves son tuyas, la facturación es tuya, y puedes usar toda la app con la IA
desactivada.

**Economía de tokens.** La IA se trata como un recurso escaso y de pago - no se esparce por todas partes:

- **Todo se cachea.** Entradas idénticas nunca pagan dos veces (`jd_hash -> scoring`, `input_hash -> output`).
- **Solo llamadas opt-in.** Nada llega a un modelo hasta que lo pides.
- **Prompts frugales.** Las funciones se limitan a la petición útil más pequeña, así que una búsqueda
  real cuesta céntimos, no una suscripción.

**Sobre la legalidad de las fuentes.** Applye es una herramienta que apuntas a ofertas que **tú** ya
estás mirando. No hace scraping de portales, no salta logins ni recolecta vacantes a escala.
Discover solo consulta APIs públicas y feeds pensados para ser leídos por software. Respeta los
términos de servicio de cualquier sitio que uses - la app está construida para mantenerte dentro de
ellos al no automatizar nunca la recolección ni el envío.

## Dónde busca Discover

Applye incluye un conjunto de fuentes integradas, y **todas vienen desactivadas**. Recolectar es
una decisión explícita: activas las fuentes que encajan con tu mercado, y hasta entonces no se
descarga nada. Cada fuente es una API pública o un feed RSS pensado para lectura automática, y
cada una lleva en la app una nota sobre su base legal.

| Fuente                   | Tipo | Mercado    | Notas                                                    |
| ------------------------ | ---- | ---------- | -------------------------------------------------------- |
| Remotive                 | API  | Mundial    | Empleo remoto, API pública                               |
| We Work Remotely         | RSS  | Mundial    | Feed RSS público                                         |
| Himalayas                | API  | Mundial    | Empleo remoto, API pública                               |
| Jobicy                   | RSS  | Mundial    | Feed RSS público                                         |
| Arbeitnow                | API  | Europa     | API pública, fuerte en ofertas en alemán                 |
| Bundesagentur für Arbeit | API  | Alemania   | API REST oficial de la agencia federal de empleo alemana |
| No Fluff Jobs            | API  | Polonia    | API pública, centrada en TI                              |
| DOU.ua                   | RSS  | Ucrania    | Feed RSS público                                         |
| Djinni.co                | RSS  | Ucrania    | Feed RSS público                                         |
| Habr Career              | RSS  | Mercado RU | Feed RSS público                                         |
| TrudVsem (Rostrud)       | API  | Mercado RU | API pública oficial                                      |

Además puedes añadir **portales de empleo de empresas**: Greenhouse, Lever, Ashby y Personio.
Apunta Applye al portal de una empresa y sus vacantes aparecen en Discover junto a los agregadores.
También admite cualquier feed RSS propio.

Lo que Applye deliberadamente **no** hace: no scrapea portales HTML, no inicia sesión en tu nombre
y no recolecta ofertas a gran escala. Si un sitio no publica un feed legible por máquinas, Applye
no lo lee.

## Capturas de pantalla

| Dashboard                                                                                           | Discover                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ![Dashboard](docs/assets/screens/dashboard.png) <br> _salud del pipeline + seguimientos pendientes_ | ![Discover](docs/assets/screens/discover.png) <br> _el feed agrupado por tus roles objetivo, con lo que coincide en cada fila_ |

| Detalle de oferta y chequeo                                                                                                  | Adaptación del CV                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| ![Detalle](docs/assets/screens/job-detail.png) <br> _palabras clave que faltan, la comprobación ATS y las señales de alarma_ | ![Adaptación](docs/assets/screens/tailoring.png) <br> _el paso de revisión del asistente, con el CV adaptado y la carta_ |

| Kanban de pipeline                                                                           | Analítica                                                                                                         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ![Pipeline](docs/assets/screens/pipeline.png) <br> _columnas aplicado / entrevista / oferta_ | ![Analítica](docs/assets/screens/analytics.png) <br> _contadores, el embudo de candidaturas y el volumen semanal_ |

## Estructura del proyecto

```
applye/
├── apps/
│   ├── desktop/          # app de escritorio Tauri 2
│   │   ├── src/          # frontend Angular (dashboard, discover, jobs, pipeline, ...)
│   │   └── src-tauri/    # backend Rust: SQLite, motor de escaneo, scoring, puente de IA
│   ├── web/              # applye.dev - landing, docs, metodología, changelog
│   └── mobile/           # placeholder para una futura app complementaria
├── libs/
│   ├── core/             # modelos de dominio e interfaces
│   ├── data/             # wrappers de invoke de Tauri y abstracciones de servicios
│   ├── ui/               # componentes Angular compartidos y tokens de diseño
│   ├── i18n/             # traducciones (en, de, ru, es, fr, uk)
│   └── skills/           # contenido versionado de prompts/skills
├── docs/                 # documentación de arquitectura, producto y diseño
└── design-system/        # fuente de verdad de diseño para cada pantalla
```

## Stack tecnológico

| Capa                | Elección                                  | Por qué                                                 |
| ------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Shell de escritorio | [Tauri 2](https://v2.tauri.app)           | Webview nativo, binarios pequeños, backend en Rust      |
| Backend             | Rust 2021 + SQLite (sqlx)                 | Capa de datos determinista, rápida y totalmente offline |
| Frontend            | Angular 21 + TypeScript                   | Signals, componentes standalone, tipos estrictos        |
| Estado              | NgRx Signals                              | Estado de UI local y predecible                         |
| Monorepo            | [Nx](https://nx.dev)                      | Un repo para escritorio, web y librerías compartidas    |
| Calidad             | Jest, ESLint, Prettier, Husky, commitlint | Tests y conventional commits obligatorios               |

![Tauri](https://img.shields.io/badge/Tauri_2-24C8DB?style=flat&logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=flat&logo=rust&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)
![Angular](https://img.shields.io/badge/Angular_21-DD0031?style=flat&logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Nx](https://img.shields.io/badge/Nx-143055?style=flat&logo=nx&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat&logo=jest&logoColor=white)

Consulta [`docs/architecture.md`](docs/architecture.md) para la estructura y el
[filtro de decisiones](docs/decision-filter.md) con el que se valida cada cambio.

## Hoja de ruta

El plan a corto plazo vive en [ROADMAP.md](ROADMAP.md); el trabajo publicado se registra en
[CHANGELOG.md](CHANGELOG.md). Próximos hitos: más fuentes en Discover, preparación de entrevistas
más profunda y builds instalables para las tres plataformas.

## Preguntas frecuentes

**¿Qué es Applye?**
Applye es una app de escritorio gratuita y de código abierto para una búsqueda de empleo asistida
por IA, que funciona en local. Puntúa ofertas frente a tu perfil, adapta tu CV a cada vacante,
redacta cartas de presentación y seguimientos, y lleva todo el pipeline en tu propia máquina.
Funciona en Windows, macOS y Linux, y nunca se postula por ti.

**¿Applye es gratis? ¿Necesito una cuenta?**
Sí, gratis y con licencia MIT, y no hay cuenta. Sin registro, sin servidor y sin suscripción:
descargas la app y funciona. Lo único que puedes pagar es la IA que conectes, y le pagas
directamente a tu proveedor, nunca a Applye.

**¿Applye se postula a ofertas por mí?**
No, y nunca lo hará. Applye puntúa, redacta y sugiere; tú revisas, editas y envías. No hay
auto-postulación, ni envío automático, ni un agente en segundo plano hablando con reclutadores en
tu nombre. El humano en el bucle es el primer principio de diseño, no una opción configurable.

**¿Dónde se guardan mis datos?**
En una base de datos SQLite local en tu máquina, junto a los documentos que Applye genera. Sin
nube, sin sincronización y sin telemetría. Nada sale del dispositivo hasta que tú lanzas una
llamada de IA, y entonces solo se envía el mínimo necesario para esa única petición.

**¿Con qué proveedores de IA funciona Applye?**
Trae el tuyo: una clave de Anthropic Claude o DeepSeek, o un puente a una CLI de IA local como
Claude Code o Codex, que es también la vía para los modelos de OpenAI. Las claves y la facturación
siguen siendo tuyas. Toda función de IA es opt-in, y la app es plenamente usable con la IA apagada.

**¿Puedo usar Applye sin IA o sin internet?**
Sí. El panel, el kanban del pipeline, el seguimiento, la línea temporal de entrevistas, la
analítica y la verificación determinista de legitimidad funcionan sin conexión y sin tokens. La IA
se gasta solo donde hace falta criterio de verdad, y solo cuando tú haces clic.

**¿Applye scrapea portales de empleo?**
No. Discover lee APIs públicas y feeds RSS publicados para lectura automática, además de portales
de empresas (Greenhouse, Lever, Ashby, Personio) que añades tú. No scrapea HTML, no evita logins y
no recolecta ofertas a gran escala. Todas las fuentes integradas vienen desactivadas.

**¿Applye es solo para Alemania?**
No. Está pensada primero para el mercado alemán y europeo - hay un informe de Eigenbemühungen para
la Agentur für Arbeit, documentos en alemán y soporte para la Blue Card -, pero las fuentes cubren
mercados mundiales, polaco, ucraniano y RU, y la interfaz habla inglés, alemán, ruso, español,
francés y ucraniano.

**¿Qué plataformas están soportadas?**
Windows, macOS (Apple Silicon e Intel) y Linux. Los instaladores se publican en la
[página de releases](https://github.com/vitala89/applye/releases); compilar desde el código fuente
está documentado en [Inicio rápido](#inicio-rápido).

## Contribuir

Las contribuciones son bienvenidas - issues, documentación, traducciones y código.

- Lee [CONTRIBUTING.md](CONTRIBUTING.md) para el setup, el flujo de ramas y las convenciones de commits.
- ¿No sabes dónde va tu pregunta? [SUPPORT.md](SUPPORT.md) la encamina.
- Sé amable: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- ¿Encontraste una vulnerabilidad? Mira [SECURITY.md](SECURITY.md) - por favor, no abras un issue público.

**¿Applye te ayudó a conseguir algo?**
[Cuenta la historia](https://github.com/vitala89/applye/issues/new?template=applye-helped.yml) - es
la única métrica que tiene el proyecto, porque dentro de la app no se mide nada.

## Sobre el autor

Applye está construida por **[Vitalii Kasap](https://vitaliikasap.com)**, ingeniero frontend
residente en Alemania, durante la misma búsqueda de empleo para la que está diseñada la app. Cada
función se publica porque hizo falta en una búsqueda real, no porque quede bien en una demo.

## También open source

- **[career-ops](https://github.com/santifer/career-ops)** de Santiago Fernández de Valderrama
  Aparicio - el proyecto que me dio ganas de construir esto. Una brillante aproximación CLI-first
  al mismo problema: convierte cualquier CLI de IA en un centro de mando para la búsqueda de
  empleo. career-ops da a los desarrolladores una CLI; Applye da a todos un escritorio. Si vives en
  una terminal, ve allí y dale una estrella.

## Aviso legal

Applye es una herramienta de productividad personal. No garantiza entrevistas, ofertas ni empleo.
Las salidas de la IA son borradores que pueden estar equivocados - revisa todo antes de enviarlo.
Applye nunca envía candidaturas en tu nombre y nunca inventa experiencia; la honestidad por encima
de la exageración es una regla de diseño, no una sugerencia. Este software se distribuye bajo la
[Licencia MIT](LICENSE) "tal cual", sin garantía de ningún tipo. Applye no está afiliada a ningún
portal de empleo, proveedor de ATS ni proveedor de IA mencionado en este documento.

## Licencia

[MIT](LICENSE) © 2026 Vitalii Kasap

## Contacto

[![Website](https://img.shields.io/badge/vitaliikasap.com-4F5BFF?style=for-the-badge&logo=safari&logoColor=white)](https://vitaliikasap.com)
[![LinkedIn](https://img.shields.io/badge/Vitalii_Kasap-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/vitaliikasap/)
[![X](https://img.shields.io/badge/@vitala89-000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/vitala89)
[![GitHub](https://img.shields.io/badge/vitala89-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/vitala89)
[![Discussions](https://img.shields.io/badge/Preguntar-Discussions-2ea44f?style=for-the-badge&logo=github&logoColor=white)](https://github.com/vitala89/applye/discussions)
