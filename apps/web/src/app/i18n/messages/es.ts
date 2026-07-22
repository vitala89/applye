import { Messages } from '../messages';

export const es: Messages = {
  meta: {
    title: 'Applye: redactar está automatizado. Enviar, no.',
    description:
      'Una aplicación de escritorio gratuita, de código abierto y local para buscar trabajo con IA. Evaluación honesta de la vacante, CV adaptado, un kanban de candidaturas. Tus datos, tu equipo, tu IA.',
  },

  nav: {
    methodology: 'Metodología',
    docs: 'Documentación',
    changelog: 'Cambios',
    blog: 'Blog',
    viewSource: 'Ver el código',
    sourceSoon: 'Código: pronto',
    language: 'Idioma',
    themeToLight: 'Cambiar al tema claro',
    themeToDark: 'Cambiar al tema oscuro',
  },

  footer: {
    tagline: 'Redactar está automatizado. Enviar, no.',
    docs: 'Documentación',
    manifesto: 'Manifiesto',
    methodology: 'Metodología',
    compare: 'Comparativa',
    blog: 'Blog',
    changelog: 'Cambios',
    press: 'Prensa',
    privacy: 'Privacidad',
    cookies: 'Cookies',
    sustain: 'Apoyar',
    licence: 'Licencia MIT',
    builtBy: 'Creado por',
  },

  consent: {
    body: 'Nos gustaría contar visitas anónimas para saber qué documentación merece la pena escribir. Sin tu permiso no se instalan cookies ni se envía ninguna petición a Google, y la aplicación en sí nunca envía nada en ningún caso.',
    learnMore: 'Qué se recoge',
    decline: 'Rechazar',
    allow: 'Permitir analítica',
  },

  docsInEnglishNote:
    'La aplicación está disponible en seis idiomas. La documentación, de momento, solo en inglés: traducirla bien lleva tiempo, y un manual traducido a máquina sería peor que un enlace honesto al original.',

  hero: {
    eyebrow: 'El principio de aumentar, no sustituir',
    titleTop: 'Redactar está automatizado.',
    titleAccent: 'Enviar, no.',
    sub: 'Una aplicación de escritorio de código abierto y local para buscar trabajo con IA. Tus datos, tu equipo, tu IA. Puntúa vacantes, adapta tu CV y sigue tus candidaturas, y te devuelve cada decisión.',
    download: 'Descargar',
    downloadSoon: 'Descargar (muy pronto)',
    viewSource: 'Ver el código en GitHub',
    sourceSoon: 'Código: muy pronto',
    meta: 'Gratis · Licencia MIT · Sin cuenta · Sin telemetría',
  },

  gap: {
    eyebrow: 'El hueco que llenamos',
    title: 'Tres herramientas, falta una.',
    saasTitle: 'SaaS en la nube',
    saasBody:
      'Potente, pero de pago mensual, y toda tu búsqueda vive en servidores ajenos. Cómo se contrata en tu país no es su problema.',
    cliTitle: 'Flujos por terminal',
    cliBody:
      'Ciclo completo, local, gratuito y excelente. Pero solo en terminal, así que habla a desarrolladores y a nadie más.',
    usTitle: 'Escritorio, local, gratis',
    usBody:
      'El ciclo completo con interfaz de escritorio: local, gratuito, MIT y consciente de cómo se contrata realmente donde estás. Configuración en 3 minutos, no en 15. Sin terminal.',
    line: 'career-ops da a los desarrolladores una CLI. Applye da a todo el mundo un escritorio.',
  },

  what: {
    eyebrow: '¿Qué es Applye?',
    body: 'Applye es una aplicación de escritorio que ejecuta todo el ciclo de búsqueda de empleo en tu equipo. Pegas una oferta; obtienes una revisión franca de RR. HH. y ATS; la aplicación redacta un CV adaptado que tú revisas y exportas; mueves la vacante por un kanban de candidaturas; y te ayuda a preparar la entrevista. Todo local, con tu propia IA (tu clave de API o la suscripción de CLI que ya pagas), con licencia MIT y gratis.',
  },

  features: {
    eyebrow: 'Qué hace',
    title: 'Hecho para darte señal, no ánimos.',
    items: [
      {
        title: 'Revisión franca de reclutador',
        example:
          'Pega una oferta y recibe una puntuación honesta de encaje, las palabras clave que te faltan, las señales de alarma que detectaría un filtro y un aprobado o suspenso claro de ATS, tal como se lee de verdad en los primeros diez segundos.',
        note: 'Sin ánimos. Solo señal.',
        linkText: 'Cómo funciona la puntuación',
      },
      {
        title: 'CV adaptado en tres pasadas',
        example:
          'Una reescritura XYZ, después una doble crítica que discute consigo misma, y por último una versión limpia exportada en PDF que sobrevive al análisis de un ATS. Lees cada línea antes de que exista como archivo.',
        note: 'Applye redacta. Tú revisas, exportas y envías.',
      },
      {
        title: 'Candidaturas en kanban',
        example:
          'Arrastra cada vacante de guardada a enviada, a entrevista y a oferta. Las fases se fechan solas y las candidaturas vencidas llevan una marca, así nada se enfría en silencio.',
        note: 'Tu tablero, en tu equipo, no el panel de un proveedor.',
      },
      {
        title: 'Trae tu propia IA',
        example:
          'Usa tu clave de API o conecta la suscripción de CLI que ya pagas: Claude Code, Codex o Gemini. El código hace el trabajo barato y determinista; al modelo solo se le pide criterio.',
        note: 'Ahorra tokens por diseño. Una búsqueda real cuesta céntimos.',
      },
      {
        title: 'Local y privado',
        example:
          'Todo vive en un único archivo SQLite en tu disco. Ninguna cuenta que crear, ninguna nube que sincronizar, ninguna telemetría. Borra el archivo y desaparece.',
        note: 'Sin nube, sin cuenta, sin seguimiento. Nunca.',
      },
    ],
  },

  local: {
    eyebrow: 'Las reglas locales, cubiertas',
    title: 'Hecho para la búsqueda que de verdad estás haciendo.',
    intro:
      'Buscar trabajo es siempre algo local, aunque el puesto sea remoto. Applye funciona en cualquier país y, donde un mercado tiene sus propias costumbres y papeleo, los contempla en lugar de fingir que todo el mundo se presenta igual.',
    points: [
      'Documentos en tu idioma: CV, cartas de presentación y preparación en cualquiera de los seis idiomas, según lo que pida la vacante.',
      'Convenciones locales: con foto o sin foto, formatos de fecha y maquetación, y las manías de los ATS que cambian según el mercado.',
      'Visado y permiso de trabajo, incluida la Tarjeta Azul de la UE, para quien se presenta desde otro país.',
      'Alineado con el RGPD por arquitectura: tus datos no salen de tu equipo, lo que satisface incluso al régimen más estricto.',
      'Alemania, en profundidad: genera el informe Eigenbemühungen para la Agentur für Arbeit directamente desde tus candidaturas registradas.',
    ],
  },

  principles: [
    { label: 'Local primero', line: 'Un archivo SQLite en tu equipo.' },
    { label: 'Privacidad por diseño', line: 'No se recoge nada. Sin telemetría.' },
    { label: 'Gratis / MIT', line: 'Código abierto y gratuito.' },
    { label: 'Tu propia IA', line: 'Tu clave o tu suscripción de CLI.' },
    { label: 'Aumentar, no automatizar', line: 'La IA redacta. Tú decides y envías.' },
  ],

  trust: {
    eyebrow: 'Abierto y honesto',
    title: 'Tus datos nunca salen de tu equipo.',
    body: 'Applye tiene licencia MIT y se desarrolla en abierto. Lee el código, lee la garantía sobre los datos, ejecútalo tú mismo.',
    repo: 'Repositorio en GitHub',
    repoSoon: 'Repositorio: muy pronto',
    guarantee: 'Garantía de soberanía de los datos',
    useTitle: 'Cuándo usar Applye',
    usePoints: [
      'Quieres menos candidaturas, pero mejor dirigidas.',
      'Te importa dónde viven los datos de tu búsqueda.',
      'Ya pagas una suscripción de IA o tienes una clave de API.',
      'Te presentas desde otro país, o en un mercado con su propio papeleo.',
    ],
    notTitle: 'Qué no es Applye',
    notPoints: [
      'No es un bot que se inscribe solo. Nunca envía por ti.',
      'No rastrea portales de empleo. Las ofertas las pegas tú.',
      'No es un servicio en la nube: sin cuenta, sin servidor, sin sincronización.',
      'No sirve para inventar experiencia. Honestidad antes que inflar.',
    ],
  },

  faq: {
    eyebrow: 'Preguntas frecuentes',
    title: 'Respuestas directas.',
    items: [
      {
        q: '¿Cómo funciona la puntuación?',
        a: 'Pegas una oferta; el código extrae los requisitos y Applye pide a tu IA que la lea como lo haría un reclutador o un ATS: puntuación de encaje, palabras clave que faltan y señales de alarma. La misma oferta nunca se puntúa dos veces: el resultado se guarda en caché según un hash del texto, así que releerla no cuesta tokens.',
      },
      {
        q: '¿De verdad es gratis?',
        a: 'Sí. Applye tiene licencia MIT y es gratuito: no hay plan de pago ni suscripción. Lo único que podrías pagar es tu propio uso de IA, y eso lo factura tu proveedor, no nosotros.',
      },
      {
        q: '¿Qué IA necesito?',
        a: 'O bien una clave de API propia, o bien una suscripción de CLI que ya tengas (Claude Code, Codex o Gemini CLI) conectada de forma que no gastes tokens de API adicionales. La IA es opcional: no se llama a ningún modelo hasta que tú lo pides.',
      },
      {
        q: '¿Mis datos son privados?',
        a: 'Del todo. Tu perfil, tus vacantes y tus documentos están en una base de datos SQLite local en tu equipo. No hay nube, ni cuenta, ni analítica. La aplicación tampoco rastrea portales: pegas ofertas que ya estabas mirando.',
      },
      {
        q: '¿Se inscribe por mí?',
        a: 'Nunca. Toda la aplicación está construida alrededor de esa línea. Applye puntúa, redacta y sugiere, y después te devuelve el control. Lees cada palabra y pulsas enviar tú. Al otro lado hay una persona, y esa relación es tuya, no de un bot.',
      },
      {
        q: '¿Funciona fuera de Alemania?',
        a: 'Sí, en cualquier sitio. Nada del ciclo principal depende de un país: pegas una oferta, se puntúa contra tu perfil, la adaptas y la sigues. Lo que cambia según el mercado es el papeleo que la rodea, y Applye lo cubre donde existe: para Alemania, el informe Eigenbemühungen y documentos en alemán; para quien se presenta desde otro país, visado y Tarjeta Azul. Son extras, nunca requisitos.',
      },
    ],
  },
};
