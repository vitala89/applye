import { Messages } from '../messages';

export const pl: Messages = {
  meta: {
    title: 'Applye: pisanie jest zautomatyzowane. Wysyłka nie.',
    description:
      'Bezpłatna aplikacja desktopowa o otwartym kodzie do szukania pracy z pomocą AI, działająca lokalnie. Szczera ocena oferty, dopasowane CV, kanban aplikacji. Twoje dane, twój komputer, twoje AI.',
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
    licence: 'Licencja MIT',
    builtBy: 'Autor',
  },

  consent: {
    body: 'Chcielibyśmy liczyć anonimowe odsłony, żeby wiedzieć, którą dokumentację warto pisać dalej. Bez twojej zgody nie zapisujemy ciasteczek ani nie wysyłamy żadnych żądań do Google, a sama aplikacja i tak nigdy niczego nie wysyła.',
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
    sub: 'Desktopowa aplikacja o otwartym kodzie do szukania pracy z pomocą AI, działająca lokalnie. Twoje dane, twój komputer, twoje AI. Ocenia oferty, dopasowuje CV i prowadzi lejek aplikacji, a każdą decyzję zostawia tobie.',
    readDocs: 'Przeczytaj dokumentację',
    download: 'Pobierz',
    downloadSoon: 'Pobieranie: wkrótce',
    downloadSoonWhy:
      'Podpisane instalatory pojawią się wraz z pierwszym publicznym wydaniem. Do tego czasu aplikację buduje się ze źródeł - dokumentacja przeprowadza przez to krok po kroku.',
    viewSource: 'Zobacz kod na GitHubie',
    sourceSoon: 'Kod: wkrótce',
    meta: 'Za darmo · Licencja MIT · Bez konta · Bez telemetrii',
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
    body: 'Applye to aplikacja desktopowa, która przeprowadza cały cykl szukania pracy na twoim komputerze. Wklejasz ogłoszenie; dostajesz szczerą ocenę okiem rekrutera i systemu ATS; aplikacja przygotowuje dopasowane CV, które sprawdzasz i eksportujesz; przesuwasz ofertę po tablicy kanban; i pomaga ci przygotować się do rozmowy. Wszystko lokalnie, z twoim własnym AI (własny klucz API albo subskrypcja CLI, za którą i tak płacisz), na licencji MIT i za darmo.',
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
          'Podłącz własny klucz API - Anthropic, OpenAI, Gemini lub DeepSeek - albo już opłaconą subskrypcję CLI: Claude Code lub Codex. Tanią, deterministyczną robotę wykonuje kod; model pytany jest wyłącznie o ocenę.',
        note: 'Oszczędne na tokenach z założenia. Realne poszukiwania kosztują grosze.',
      },
      {
        title: 'Lokalnie i prywatnie',
        example:
          'Wszystko mieści się w jednym pliku SQLite na twoim dysku. Żadnego konta, żadnej synchronizacji z chmurą, żadnej telemetrii. Usuwasz plik i po danych.',
        note: 'Bez chmury, bez konta, bez śledzenia. Nigdy.',
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
      'Zgodność z RODO z samej architektury: dane nie opuszczają twojego komputera, co spełnia nawet najostrzejszy reżim.',
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
    { label: 'Najpierw lokalnie', line: 'Jeden plik SQLite na twoim komputerze.' },
    { label: 'Prywatność u podstaw', line: 'Nic nie jest zbierane. Bez telemetrii.' },
    { label: 'Za darmo / MIT', line: 'Otwarty kod, bezpłatnie.' },
    { label: 'Własne AI', line: 'Twój klucz albo twoja subskrypcja CLI.' },
    { label: 'Wspierać, nie automatyzować', line: 'AI pisze szkic. Ty decydujesz.' },
  ],

  trust: {
    eyebrow: 'Otwarcie i uczciwie',
    title: 'Twoje dane nie opuszczają twojego komputera.',
    body: 'Applye jest na licencji MIT i rozwijane otwarcie. Przeczytaj kod, przeczytaj gwarancję dotyczącą danych, uruchom je sam.',
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
      'To nie usługa w chmurze: bez konta, bez serwera, bez synchronizacji.',
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
        a: 'Tak. Applye jest na licencji MIT i bezpłatne: nie ma planu płatnego ani subskrypcji. Zapłacić możesz najwyżej za własne użycie AI, a rozlicza je twój dostawca, nie my.',
      },
      {
        q: 'Jakiego AI potrzebuję?',
        a: 'Albo własnego klucza API (Anthropic, OpenAI, Gemini lub DeepSeek), albo subskrypcji CLI, którą już masz - Claude Code lub Codex - podłączonej tak, że nie zużywasz dodatkowych tokenów API. Gemini działa wyłącznie przez klucz API: Google wycofał Gemini CLI dla kont prywatnych w czerwcu 2026. AI jest opcjonalne: żaden model nie zostanie wywołany, dopóki sam o to nie poprosisz.',
      },
      {
        q: 'Czy moje dane są prywatne?',
        a: 'Całkowicie. Profil, oferty i dokumenty leżą w lokalnej bazie SQLite na twoim komputerze. Nie ma chmury, konta ani analityki. Discover pobiera oferty prosto z publicznych API i kanałów na twój komputer - nikt nie dowiaduje się, czego szukałeś - a resztę wklejasz sam.',
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
