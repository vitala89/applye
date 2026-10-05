import { Messages } from '../messages';

export const pl: Messages = {
  meta: {
    title: 'Applye: pisanie jest zautomatyzowane. Wysyłka nie.',
    description:
      'Applye Desktop to darmowa, lokalna aplikacja do szukania pracy. Platforma webowa Career Intelligence jest w rozwoju i jeszcze jej nie ma.',
  },

  nav: {
    methodology: 'Metodologia',
    docs: 'Dokumentacja',
    changelog: 'Zmiany',
    blog: 'Blog',
    viewSource: 'Zobacz kod',
    sourceSoon: 'Kod: wkrótce',
    language: 'Język',
    themeToLight: 'Przełącz na jasny motyw',
    themeToDark: 'Przełącz na ciemny motyw',
  },

  footer: {
    tagline: 'Pisanie jest zautomatyzowane. Wysyłka nie.',
    docs: 'Dokumentacja',
    manifesto: 'Manifest',
    methodology: 'Metodologia',
    compare: 'Porównanie',
    blog: 'Blog',
    changelog: 'Zmiany',
    press: 'Prasa',
    privacy: 'Prywatność',
    cookies: 'Cookies',
    sustain: 'Wesprzyj',
    groupProduct: 'Produkt',
    groupProject: 'Projekt',
    groupLegal: 'Informacje prawne',
    contact: 'Kontakt',
    licence: 'Licencja MIT',
    builtBy: 'Autor',
  },

  consent: {
    body: 'Licznik bez ciasteczek już zlicza wizyty, niczego nie zapisując ani nikogo nie identyfikując. Google Analytics pokazałby dodatkowo, co jest czytane i klikane, i ładuje się tylko za twoją zgodą. W żadnym wypadku bez ciasteczek. Applye Desktop nie wysyła własnej telemetrii.',
    learnMore: 'Co jest zbierane',
    decline: 'Odrzuć',
    allow: 'Zezwól na analitykę',
  },

  docsInEnglishNote:
    'Aplikacja jest dostępna w sześciu językach. Dokumentacja na razie tylko po angielsku: porządne tłumaczenie wymaga czasu, a maszynowo przetłumaczony podręcznik byłby gorszy niż uczciwy link do oryginału.',

  hero: {
    eyebrow: 'Zasada wspierania, nie zastępowania',
    titleTop: 'Pisanie jest zautomatyzowane.',
    titleAccent: 'Wysyłka nie.',
    sub: 'Applye Desktop to otwarta, lokalna aplikacja do szukania pracy z pomocą AI. Twoje dane zostają na twoim komputerze, przynosisz własne AI, a każda decyzja zostaje twoja.',
    readDocs: 'Przeczytaj dokumentację',
    download: 'Pobierz',
    downloadSoon: 'Pobieranie: wkrótce',
    downloadSoonWhy:
      'Podpisane instalatory pojawią się wraz z pierwszym publicznym wydaniem. Do tego czasu aplikację buduje się ze źródeł - dokumentacja przeprowadza przez to krok po kroku.',
    viewSource: 'Zobacz kod na GitHubie',
    sourceSoon: 'Kod: wkrótce',
    meta: 'Darmowy rdzeń desktopowy · MIT · Bez konta Applye · Bez telemetrii desktopu',
  },

  gap: {
    eyebrow: 'Luka, którą wypełniamy',
    title: 'Trzy narzędzia, jednego brakuje.',
    saasTitle: 'Chmurowy SaaS',
    saasBody:
      'Mocny, ale płatny co miesiąc, a całe twoje poszukiwanie żyje na cudzych serwerach. To, jak wygląda rekrutacja u ciebie, nie jest jego zmartwieniem.',
    cliTitle: 'Potoki w terminalu',
    cliBody:
      'Pełny cykl, lokalnie, za darmo i świetnie zrobione. Ale tylko w terminalu, więc mówi do programistów i do nikogo więcej.',
    usTitle: 'Desktop, lokalnie, za darmo',
    usBody:
      'Ten sam pełny cykl w zwykłym interfejsie: lokalnie, za darmo, na licencji MIT i ze świadomością tego, jak rekrutacja wygląda tam, gdzie szukasz. Konfiguracja w 3 minuty, nie w 15. Bez terminala.',
    line: 'career-ops daje programistom CLI. Applye daje wszystkim aplikację desktopową.',
  },

  what: {
    eyebrow: 'Czym jest Applye?',
    body: 'Applye Desktop przeprowadza cykl szukania pracy na twoim komputerze. Wklejasz ogłoszenie; dostajesz szczerą ocenę okiem rekrutera i systemu ATS; aplikacja przygotowuje dopasowane CV, które sprawdzasz i eksportujesz; przesuwasz ofertę po tablicy kanban; i pomaga ci przygotować się do rozmowy. Wszystko lokalnie, z twoim własnym AI, a rdzeń desktopowy jest na licencji MIT i za darmo. Platforma webowa Career Intelligence jest w rozwoju i jeszcze nie jest dostępna.',
  },

  features: {
    eyebrow: 'Co potrafi',
    title: 'Zbudowane, by dawać sygnał, a nie pocieszenie.',
    items: [
      {
        title: 'Szczera ocena okiem rekrutera',
        example:
          'Wklej ofertę i otrzymaj uczciwą ocenę dopasowania, brakujące słowa kluczowe, czerwone flagi, które wychwyci wstępna selekcja, oraz jasny wynik testu ATS - dokładnie tak, jak czyta się przez pierwsze dziesięć sekund.',
        note: 'Żadnego pocieszania. Sam sygnał.',
        linkText: 'Jak działa ocena',
      },
      {
        title: 'Dopasowane CV w trzech przebiegach',
        example:
          'Przepisanie w schemacie XYZ, potem podwójna krytyka spierająca się sama ze sobą, na końcu czysta wersja w PDF, która przechodzi przez parser ATS. Czytasz każdy wiersz, zanim stanie się plikiem.',
        note: 'Applye pisze szkic. Ty sprawdzasz, eksportujesz i wysyłasz.',
      },
      {
        title: 'Lejek jako kanban',
        example:
          'Przeciągaj ofertę z zapisanych do wysłanych, na rozmowę i do oferty. Etapy datują się same, a zaległe aplikacje dostają znacznik, więc nic nie stygnie po cichu.',
        note: 'Twoja tablica, na twoim komputerze, a nie panel dostawcy.',
      },
      {
        title: 'Własne AI',
        example:
          'Podłącz własny klucz API - Anthropic lub DeepSeek - albo już opłaconą subskrypcję CLI: Claude Code lub Codex. Tanią, deterministyczną robotę wykonuje kod; model pytany jest wyłącznie o ocenę.',
        note: 'Oszczędne na tokenach z założenia. Realne poszukiwania kosztują grosze.',
      },
      {
        title: 'Lokalnie i prywatnie',
        example:
          'W Applye Desktop wszystko mieści się w jednym pliku SQLite na twoim dysku. Bez konta Applye, bez synchronizacji z chmurą, bez telemetrii. Usuwasz plik i po danych.',
        note: 'Desktop: bez synchronizacji z chmurą, bez konta Applye, bez śledzenia.',
      },
    ],
  },

  local: {
    eyebrow: 'Lokalne zasady uwzględnione',
    title: 'Pod poszukiwania, które naprawdę prowadzisz.',
    intro:
      'Szukanie pracy zawsze jest lokalne, nawet gdy sama praca jest zdalna. Applye działa wszędzie, a tam, gdzie rynek ma własne zwyczaje i formalności, obsługuje je zamiast udawać, że wszyscy aplikują tak samo.',
    points: [
      'Dokumenty w twoim języku: CV, listy motywacyjne i przygotowanie w jednym z sześciu języków, pod to, czego oczekuje oferta.',
      'Lokalne zwyczaje: zdjęcie albo jego brak, formaty dat i układu oraz dziwactwa systemów ATS różne w każdym kraju.',
      'Wiza i pozwolenie na pracę, w tym Niebieska Karta UE, dla aplikujących zza granicy.',
      'Applye Desktop trzyma dane poszukiwań na twoim komputerze. Opuszczają go tylko wtedy, gdy sam wywołasz skonfigurowanego dostawcę AI. Przyszły produkt webowy jest osobny i jeszcze nie jest dostępny.',
      'Niemcy, dogłębnie: raport Eigenbemühungen dla Agentur für Arbeit prosto z zapisanych aplikacji.',
    ],
  },

  engines: {
    title: 'Działa z AI, za które już płacisz.',
    intro:
      'Applye nie ma własnego modelu i nie odsprzedaje tokenów. Podaj klucz dostawcy albo podepnij subskrypcję CLI, którą już masz - zapytania idą prosto z twojego komputera do nich.',
    apiLabel: 'Bezpośrednie klucze API',
    cliLabel: 'Subskrypcje CLI, podpięte',
    note: 'Niezależne znaki towarowe ich właścicieli. Nie sugerujemy powiązania ani rekomendacji.',
  },

  principles: [
    { label: 'Najpierw lokalnie', line: 'Desktop: jeden plik SQLite na twoim komputerze.' },
    { label: 'Prywatność u podstaw', line: 'Desktop nie zbiera telemetrii.' },
    { label: 'Za darmo / MIT', line: 'Rdzeń desktopowy jest otwarty i bezpłatny.' },
    { label: 'Własne AI', line: 'Twój klucz albo twoja subskrypcja CLI.' },
    { label: 'Wspierać, nie automatyzować', line: 'AI pisze szkic. Ty decydujesz.' },
  ],

  trust: {
    eyebrow: 'Otwarcie i uczciwie',
    title: 'Applye Desktop trzyma twoje dane na twoim komputerze.',
    body: 'Aplikacja desktopowa jest na licencji MIT i rozwijana otwarcie. Przeczytaj kod, przeczytaj gwarancję dotyczącą danych, uruchom ją sam. Platforma webowa Career Intelligence jest w rozwoju; dziś nie jest dostępna, a konto webowe samo nie wgra danych z desktopu.',
    repo: 'Repozytorium na GitHubie',
    repoSoon: 'Repozytorium: wkrótce',
    guarantee: 'Gwarancja suwerenności danych',
    useTitle: 'Kiedy Applye ma sens',
    usePoints: [
      'Chcesz mniej aplikacji, ale lepiej dopasowanych.',
      'Zależy ci na tym, gdzie leżą dane twoich poszukiwań.',
      'Masz już subskrypcję AI albo klucz API.',
      'Aplikujesz zza granicy albo na rynku z własnymi formalnościami.',
    ],
    notTitle: 'Czym Applye nie jest',
    notPoints: [
      'To nie bot do automatycznego aplikowania. Nigdy nie wysyła za ciebie.',
      'To nie scraper zamkniętych portali. Discover czyta publiczne API i kanały, resztę wklejasz sam.',
      'To nie usługa w chmurze dla Applye Desktop: bez konta Applye, bez kopii na serwerze, bez synchronizacji.',
      'To nie jest już wydana aplikacja webowa. Ta platforma jest w rozwoju i będzie oparta na koncie.',
      'To nie sposób na zmyślenie doświadczenia. Uczciwość zamiast podkoloryzowania.',
    ],
  },

  faq: {
    eyebrow: 'Częste pytania',
    title: 'Konkretne odpowiedzi.',
    items: [
      {
        q: 'Jak działa ocena?',
        a: 'Wklejasz ogłoszenie; kod wyciąga wymagania, a Applye prosi twoje AI, żeby przeczytało je tak, jak zrobiłby to rekruter albo system ATS: ocena dopasowania, brakujące słowa kluczowe, czerwone flagi. Ta sama oferta nie jest oceniana dwa razy - wynik trafia do pamięci podręcznej według skrótu tekstu, więc ponowne czytanie nic nie kosztuje.',
      },
      {
        q: 'Czy to naprawdę za darmo?',
        a: 'Desktopowy rdzeń Applye jest bezpłatny i objęty licencją MIT oraz działa bez subskrypcji Applye. Opcjonalne usługi webowe lub hostowane mogą mieć osobne płatne plany; lokalny workflow desktopowy pozostanie użyteczny bez nich.',
      },
      {
        q: 'Jakiego AI potrzebuję?',
        a: 'Albo własnego klucza API (Anthropic lub DeepSeek), albo subskrypcji CLI, którą już masz - Claude Code lub Codex - podłączonej tak, że nie zużywasz dodatkowych tokenów API. Modele OpenAI są dostępne przez Codex; trybu OpenAI na klucz API nie ma. Google nie jest obsługiwane wcale: Gemini CLI wycofano dla kont prywatnych w czerwcu 2026. AI jest opcjonalne: żaden model nie zostanie wywołany, dopóki sam o to nie poprosisz.',
      },
      {
        q: 'Czy moje dane są prywatne?',
        a: 'Applye Desktop jest prywatny domyślnie. Profil, oferty i dokumenty leżą w lokalnej bazie SQLite, bez konta Applye i bez automatycznej synchronizacji z chmurą. Dane opuszczają komputer tylko wtedy, gdy sam wywołasz skonfigurowanego dostawcę AI. Przyszły produkt webowy będzie trzymał własne dane na serwerze. Dziś nie jest dostępny, a konto webowe samo nie wgra danych z desktopu. Discover nadal pobiera publiczne kanały na twój komputer.',
      },
      {
        q: 'Czy aplikuje za mnie?',
        a: 'Nigdy. Wokół tej granicy zbudowana jest cała aplikacja. Applye ocenia, pisze szkice i podpowiada, a potem oddaje ci sterowanie. Czytasz każde słowo i sam klikasz wyślij. Po drugiej stronie jest człowiek, a ta relacja należy do ciebie, nie do bota.',
      },
      {
        q: 'Czy działa poza Niemcami?',
        a: 'Tak, wszędzie. W głównym cyklu nic nie zakłada konkretnego kraju: wklejasz ofertę, zostaje oceniona względem twojego profilu, dopasowujesz CV i prowadzisz aplikację. Między rynkami różnią się formalności wokół, a te Applye obsługuje tam, gdzie istnieją: dla Niemiec raport Eigenbemühungen i dokumenty po niemiecku, dla aplikujących zza granicy kwestie wizy i Niebieskiej Karty. To dodatki, nigdy wymogi.',
      },
    ],
  },
};
