# Entregable mínimo — seguimiento de Luna

## Publicación inicial en inglés

**Estado general:** primera publicación en inglés completada y verificada — 2026-10-27 18:47 MDT.
**Codificado por:** GPT-6 Luna (`/root/luna_english_release`).
**Revisado por:** Codex (`/root`).
**Verificado por:** Codex (`/root`), pruebas desde la URL pública.
**Alcance:** interfaz, documentos canónicos, pruebas y configuración estática Vite/Vercel; publicación a cargo del coordinador.

| ID | Tarea y criterio de aceptación | Estado | Codificado por | Revisado por | Evidencia / archivos / último avance |
| --- | --- | --- | --- | --- | --- |
| EN01 | Todas las superficies de usuario en inglés; Civic Compass, `lang="en"`, fechas `en-US`, avisos y vacantes según el brief | Verificado | GPT-6 Luna (/root/luna_english_release), 2026-10-27 18:38 MDT | Codex (/root) | `src/main.tsx`, `src/lib/domain.ts`, `src/lib/supabase.ts`, `index.html`; aviso exacto, privacidad honesta sobre logs del proveedor y plantilla Vacant. Typecheck, build, test English y Chrome confirmaron UI/idioma/fechas. |
| EN02 | Requisitos, brief, README y tests alineados con la publicación English-only, sin alterar hechos/fingerprints | Verificado | GPT-6 Luna (/root/luna_english_release), 2026-10-27 18:38 MDT | Codex (/root) | Actualizados `docs/PRODUCT_REQUIREMENTS.md`, `docs/MVP_IMPLEMENTATION_BRIEF.md`, `README.md`, `supabase/README.md`, pruebas unitarias y browser scripts. Browser probó cohorts 2008/2025, aviso/privacy, respuesta revisada y flujo real. |
| EN03 | Build estático y cabeceras mínimas compatibles con Vercel; sin telemetría ni secretos de servicio | Verificado | GPT-6 Luna (/root/luna_english_release), 2026-10-27 18:38 MDT | Codex (/root) | Producción READY; HTTP 200 anónimo, CSP/HTTPS y cabeceras presentes, archivos privados/fuentes no servidos (404). Flujo real en URL pública pasó ambos cohorts y viewports320/390/820/1440. |

## Refresh de marca e interfaz

**Estado general:** BR01–BR05 verificados; renovación NPA publicada en https://naturalization-preparation-app.vercel.app/ — 2026-10-27 20:07 MDT.
**Codificado por:** GPT-6 Luna (`/root/luna_branding_refresh`).
**Revisado por:** Codex (/root), 2026-10-27 20:07 MDT; ver [BRANDING_REFRESH_REVIEW.md](BRANDING_REFRESH_REVIEW.md).
**Referencias visuales:** MatPro `ff0c2488e412db90ff2bac7db086acb102df12c5` y DivisionPro `257b32b37693fade5dc5dc92c3ce0668f6581ae2`; consultados CSS y HTML mediante GitHub.

| ID | Tarea y criterio de aceptación | Estado | Codificado por | Revisado por | Evidencia / archivos / último avance |
| --- | --- | --- | --- | --- | --- |
| BR01 | Restyle profesional, responsive y móvil primero, con fondos fríos, superficies blancas, jerarquía sans, controles accesibles y foco visible | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | `src/style.css`; revisión en Chrome a 320/390/820/1440px, sin overflow. Capturas seguras de hub móvil y escritorio listas para el coordinador. La comprobación del nombre largo final corresponde a BR05. |
| BR02 | Tagline solicitado y terminología visible Question Edition con opciones 2008/2025; mantener idioma, fechas y mecánicas existentes | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | `src/main.tsx`, `index.html`, `scripts/check-english-copy.mjs`; check English, build, typecheck y 4 unit tests aprobados; el texto visible no contiene “bank”. |
| BR03 | Mapa estadounidense reconocible con estrellas y franjas, cargado localmente y con licencia/procedencia verificable | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | `public/us-map-flag.svg`; geometría de 50 estados adaptada de [Wikimedia Commons: Blank US Map (states only).svg](https://commons.wikimedia.org/wiki/File:Blank_US_Map.svg), atribuida a Heitordp, CC0 1.0 ([licencia](https://creativecommons.org/publicdomain/zero/1.0/)); favicon SVG enlazado en `index.html`. SVG local sin contenido activo ni referencias externas; aspecto comprobado en captura móvil/escritorio. |
| BR04 | Preservar avisos, fuentes, sesión anónima, reanudación, caducidad a 168 h, tarjetas y autoevaluación; compartir capturas seguras para revisión | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | `npm run test:browser` y `npm run test:browser-flow` aprobados: avisos, recuperación y score, fuentes/fechas, tarjetas, quiz, burbuja de 5 s, dos ediciones y viewports 320/390/820/1440px. Coordinador inspeccionó capturas seguras de hub y avisos. Eliminadas exactamente dos sesiones sintéticas por hash; consulta posterior confirmó cero coincidencias. |
| BR05 | Aplicar Naturalization Preparation App (NPA) en marca, accesibilidad, metadatos, documentos y pruebas; comprobar nombre completo y NPA en dispositivos apropiados | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | Nombre/hostname seleccionados por el propietario; coordinador confirmó `naturalization-preparation-app.vercel.app` verificado en el proyecto existente. App/docs canónicos actualizados; checks finales aprobaron, incluidos NPA a 320/390 y nombre completo a 820/1440. Publicado en el hostname aprobado; flujo HTTPS completo pasó ambas ediciones, recuperación/puntuación y cuatro tamaños. Archivos JS/CSS/SVG idénticos a dist revisado; CI Security aprobada. URL anterior redirige 307. Base, hechos y sesiones conservados. |

## Study Flash Cards y practice tests

**Estado general:** FC01–FC10 verificados y publicados; flujo HTTPS público completo aprobado — 2026-10-28 00:23 MDT.
**Codificado por:** GPT-6 Luna (`/root/luna_branding_refresh`, frontend).
**Revisado por:** Codex (/root), 2026-10-28 00:21 MDT; ver [FLASHCARDS_REVIEW.md](FLASHCARDS_REVIEW.md).
**Contrato frontend/backend:** [Flashcard implementation brief](FLASHCARDS_IMPLEMENTATION_BRIEF.md).

| ID | Tarea y criterio de aceptación | Estado | Codificado por | Revisado por | Evidencia / archivos / último avance |
| --- | --- | --- | --- | --- | --- |
| FC01 | Entrada a Study Flash Cards desde el hub, Back en notices 2/3 y SVG open-book semántico | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | Hub/settings implementados en `src/main.tsx` y `src/components/FlashcardsFeature.tsx`; conservar marca NPA y Quick Quiz. |
| FC02 | Settings: cantidad sincronizada, Random, In order, By topic, rango inclusivo y límite real por pregunta | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | Selector usa pregunta oficial/sección/subsección; límites, conteo/rango inclusivo y pruebas unitarias listos. |
| FC03 | Ayudas accesibles por método, touch/teclado, foco, reduced motion y controles mobile-first | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | Ayudas por método con tap/hover/foco/Escape/dismiss/fade; controles numéricos editables y foco interno. |
| FC04 | Include practice test, Test yourself explícito, rolling rounds acumulativos y estimación de presentaciones | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | Round UUID CSPRNG; tamaños acumulativos, totales 210 para 20/1 y protección ante step inválido cubiertos por unit tests. |
| FC05 | Flashcard animada con pregunta/respuestas completas, fuentes, fechas, warning y progreso | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | Card translúcida con fallback, flip tap/teclado, reduced motion, fuentes/fechas, warning y bubble con fade de 5 segundos. |
| FC06 | Practice test con exactamente cuatro opciones completas y una correcta, sin answer key antes de confirmar | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | Distractores seguros usan la edición completa; 100/100 y 128/128 sets factibles en benchmark local, con cardinalidad explícita para respuestas múltiples. |
| FC07 | Temporizador real de 15 segundos, Skip/timeout, sin navegación anterior y envío idempotente checkpoint por pregunta | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | Confirmación usa `Date.now()`; RPC guarda cada prefijo y reintenta mismo resultado/UUID sin almacenar texto de opciones. |
| FC08 | Resultados Correct/Incorrect/Skipped, porcentaje por presentaciones y priorización de errores previos | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | Resultados separan intentos repetidos y únicas; hub recupera totales persistidos de test separadamente del Quick Quiz. |
| FC09 | Unit/English/browser regression, README y capturas seguras notice/settings/card/hub | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | `npm run typecheck`, `npm run build`, `npm test` (18/18), `npm run test:english`, `node --check scripts/browser-flow.mjs`, `git diff --check` y flujo Chrome/Supabase completo pasaron; capturas seguras de aviso, settings, tarjeta y hub móvil/escritorio. Ver avance 2026-10-28. |
| FC10 | Persistencia privada, aislamiento por sesión, expiración, cascade y deduplicación RPC/SQL | Verificado | GPT-6 Luna (/root/luna_flashcard_backend) | Codex (/root) | Migration `20261028031842_flashcard_progress.sql` aplicada por root; SQL regression, advisors y reintentos/concurrencia HTTP pasaron. Contract: [flashcards brief](FLASHCARDS_IMPLEMENTATION_BRIEF.md). |

## Quick Question y contenido revisado

**Estado general:** QQ01–QQ07 verificados y publicados en https://naturalization-preparation-app.vercel.app/ — 2026-10-28 09:42 MDT.
**Brief autorizado:** [Quick Question implementation brief](QUICK_QUESTION_IMPLEMENTATION_BRIEF.md).
**Revisión:** Codex (/root), revisión de contenido/SQL/API/build y flujo HTTPS público completo; ver [QUICK_QUESTION_REVIEW.md](QUICK_QUESTION_REVIEW.md).

| ID | Tarea y criterio de aceptación | Estado | Codificado por | Revisado por | Evidencia / archivos / último avance |
| --- | --- | --- | --- | --- | --- |
| QQ01 | Calificación exacta por conceptos y aliases revisados; orden libre, puntuación/guiones/espacios, sin fuzzy ni duplicados semánticos | Verificado | GPT-6 Luna (frontend) | Codex (/root) | `src/lib/quick-question.ts`, `src/lib/quick-question.test.ts`; cobertura para multi-parte, números/abreviaturas, speech/expression, negación, nombres incorrectos, espacios vacíos y entradas parciales dispersas. |
| QQ02 | Quick Question escrito sin temporizador, directamente en el hub; feedback con giro accesible, canonical answer display, fecha/fuentes y burbuja dependiente de 5 s | Verificado | GPT-6 Luna (frontend) | Codex (/root) | `src/components/QuickQuestionFeature.tsx`, `src/style.css`; usa `formatAnswers(question)` y oculta los aliases internos. Respuestas permanecen en memoria; Check/Skip/retry/Another question; navegar fuera no registra nada. |
| QQ03 | Opciones MC construidas solo con metadata revisada, completas y alias-excluyentes; cerrar si falta metadata | Verificado | GPT-6 Luna (frontend) | Codex (/root) | `buildReviewedTestOptionSets` en `src/lib/flashcards.ts`; no hay fallback al generador provisional. Cobertura de 4 opciones/1 correcta, cardinalidad, alias de sets aceptados y fail-closed. |
| QQ04 | RPC frontend para metadata/progreso/respuesta escrita; totales written y MC separados y errores unificados para priorización | Verificado | GPT-6 Luna (frontend) | Codex (/root) | `src/lib/supabase.ts`, `src/main.tsx`, `src/components/FlashcardsFeature.tsx`; integración real aplicada, browser flow verificó guardado, separación de contadores y reanudación. Root aprobó la revisión de 1.438 filas y el API concurrente. |
| QQ05 | Catálogo versionado para 228 preguntas y proyecciones, aliases revisados y al menos tres sets plausibles completos por pregunta | Verificado | GPT-6 Luna (/root/luna_practice_content) | Codex (/root) | Root aprobó e importó el catálogo `3827b9a…` tras revisión semántica de las 228 preguntas. Los RPC públicos respondieron con 100/128 preguntas para UT/DC/AS. Root verificó las 1.438 variantes geográficas y todas las opciones/aliases para UT/DC/AS. |
| QQ06 | Tablas/RPC privados, idempotencia por modo/attempt, caducidad, aislamiento, cascade y pruebas SQL/API | Verificado | GPT-6 Luna (/root/luna_flashcard_backend) | Codex (/root) | Root aplicó tres migraciones, activó catálogo y aprobó SQL/API, idempotencia y 25 lotes de lectura sobre 1.438 filas. Advisors sin lints; fingerprints originales intactos. |
| QQ07 | English/unit/API/browser regression, README/product docs y capturas seguras | Verificado | GPT-6 Luna (frontend) | Codex (/root) | Typecheck/build, 20 unit tests, English, browser flow real completo en ambos cohorts, `git diff --check`; capturas seguras en `/tmp/quick-question-verified-*`. Root revisó build/20 unit tests/English, todas las variantes devueltas y opciones completas; publicación READY y flujo HTTPS completo aprobados. Assets revisados idénticos; CI Security aprobada; sesiones sintéticas eliminadas por hashes exactos. |

## Match & Learn

**Estado general:** MM01–MM08 verificados; publicado y probado en HTTPS.
**Brief autorizado:** [Match & Learn implementation brief](MATCHING_IMPLEMENTATION_BRIEF.md).

| ID | Tarea y criterio de aceptación | Estado | Codificado por | Revisado por | Evidencia / archivos / último avance |
| --- | --- | --- | --- | --- | --- |
| MM01 | Constructor de tableros desde metadata revisada: sin preguntas repetidas, alias ambiguos ni conceptos superpuestos; máximo 10 fichas; cobertura completa | Verificado | GPT-6 Luna (frontend) | Codex (/root) | `src/lib/matching.ts`, `src/lib/matching.test.ts`; deduplica IDs, falla cerrado ante alias superpuestos y difiere preguntas sin perderlas. |
| MM02 | Ajustes móviles accesibles: cantidad 4–30, 4/5 por ronda, cuatro ritmos, priorizar falladas y resumen real de rondas | Verificado | GPT-6 Luna (frontend) | Codex (/root) | `src/components/MatchLearnFeature.tsx`, `src/style.css`; defaults 12/4/Standard, conteo y slider sincronizados, vista previa de todas las rondas. |
| MM03 | Emparejamiento por toque/teclado, edición antes de enviar, contador accesible de respuestas asignadas | Verificado | GPT-6 Luna (frontend) | Codex (/root) | Botones accesibles con asignación en ambos órdenes, retirada/reasignación, etiquetas de progreso `n/m answers placed`. |
| MM04 | Deadline absoluto por ronda, autoenvío seguro y modo Untimed; cierre confirma sin inventar intentos | Verificado | GPT-6 Luna (frontend) | Codex (/root) | Deadline usa hora de pared, sigue al ocultar pestaña, congela outcomes y UUID; confirmación de salida y `beforeunload`; Untimed no instala intervalo. |
| MM05 | Puntuación por pregunta y review final local con respuestas parciales/slots faltantes, aliases aceptados, fecha/fuentes | Verificado | GPT-6 Luna (frontend) | Codex (/root) | Puntuación por aliases visibles de metadata; detalle sólo en memoria de componente; disclosure usa respuestas oficiales de `formatAnswers`, fecha y fuentes. |
| MM06 | Integración RPC `record_matching_round`, reintento idéntico por UUID/outcomes y recuperación únicamente agregada | Verificado | GPT-6 Luna (frontend); backend GPT-6 Luna | Codex (/root) | Cliente en `src/lib/supabase.ts` envía sólo número/outcome y UUID; retry mantiene resultado y payload congelados. Root aplicó migración 20261029032833 tras revisión; SQL/API, concurrencia, límites, caducidad y cascade aprobaron. |
| MM07 | Entrada del hub y totales separados Matching, escrito y multiple-choice; prioridad de falladas agregada | Verificado | GPT-6 Luna (frontend) | Codex (/root) | `src/main.tsx`; nuevo SVG matching nativo, total matching separado, prioridad desde proyección agregada multi-modo. |
| MM08 | README/requisitos/check English, unit/browser/API y regresión existente; revisión antes de publicar | Verificado | GPT-6 Luna (frontend) | Codex (/root) | Typecheck/build, 30 unit tests, English y `git diff --check` pasan. Root ejecutó API, contenido real (486 planes), browser matching completo y regresión de juegos anteriores; todo aprobado. Publicado en la URL canónica: browser matching completo y regresión pública aprobaron; assets idénticos, Vercel READY y CI Security exitosa. Ver `docs/MATCHING_REVIEW.md`. |

## Hub game colors

| ID | Task | Status | Coded by | Reviewed by | Evidence |
| --- | --- | --- | --- | --- | --- |
| HC01 | Distinct hub gradients: purple/indigo Study Flash Cards, orange/terracotta Match & Learn, existing blue/turquoise Quick Quiz | Verified | GPT-6 Luna (frontend) | Codex (/root) | `src/main.tsx`, `src/style.css`; build, English and whitespace checks passed. New-card text contrast minima: 7.52:1 and 4.92:1. Real hub checked at 320/390/820/1440; root inspected phone/desktop card captures. Names, icons, focus and game behavior preserved. |

### Avance

- 2026-10-28 08:57 MDT — GPT-6 Luna integró el primer frontend: Quick Question usa
  matching exacto de metadata y evita immediate repeat; los fallos de metadata
  son visibles y reintentables. El generador MC ahora requiere cuatro opciones
  derivadas de `PracticeMetadata` y falla cerrado cuando faltan datos. El hub
  separa counters written/MC y Flash Cards usa el progreso agregado para
  priorizar errores de ambos modos. `npm run typecheck`, `npm run build`,
  `npm test` (19/19), `npm run test:english` y `git diff --check` aprobaron.
  Las llamadas remotas/catálogo y el flujo completo quedan pendientes del
  backend y del dataset revisado. Sin commit, push ni despliegue.
- 2026-10-28 09:03 MDT — GPT-6 Luna preparó el browser flow Quick Question con
  casos correct/incorrect/skipped, >15 s sin temporizador, última casilla
  incompleta, conceptos válidos en orden inverso, no repetición inmediata,
  doble clic, reintento con el mismo attempt UUID, ausencia de impresiones y
  comprobación del payload de resultado sin conservar respuestas. Incluye ambos
  cohorts y viewports 320/390/820/1440; no ejecutado hasta que root apruebe y
  aplique catálogo/RPC. Ajustó el giro para que solo la cara activa determine la
  altura y la entrada larga quede junto al enunciado; mostró contexto del
  anterior ocupante al presentar Vacant, sin añadirlo a los alias aceptados.
  Typecheck, build, 19 unit tests, English y `git diff --check` pasan.
- 2026-10-28 09:11 MDT — GPT-6 Luna ajustó el normalizador para ignorar
  diferencias diacríticas en nombres personales sin aceptar cambios de letras
  (`Nydia Velázquez` / `Nydia Velazquez` aceptados; `Nidia Velazquez` rechazado).
  Se añadió esta regla a requisitos de producto. Typecheck, build, 20 unit tests,
  English, sintaxis del browser flow y `git diff --check` pasan. El flujo real
  sigue pendiente de catálogo/RPC aprobados por root.
- 2026-10-28 09:17 MDT — GPT-6 Luna añadió `test:api:quick-question` al
  `package.json` y su comando a README para el verifier idempotente/mode-separated
  del backend. Backend fue notificado para ejecutarlo; sus resultados todavía
  no se han recibido. El catálogo de contenido sigue en revisión, por lo que el
  browser flow no se ha ejecutado.
- 2026-10-28 09:30 MDT — GPT-6 Luna ejecutó el browser flow real completo con
  ambos cohorts: Quick Question untimed >15 s, correct/incorrect/skipped,
  respuestas multi-concepto parciales y reordenadas, doble clic, reintento con
  el mismo attempt UUID, payload privado, no-impression/no-repeat y totales
  persistidos; también pasó flashcards, Quick Quiz, recuperación y viewports
  320/390/820/1440. Capturas seguras en `/tmp/quick-question-verified-*`; hashes
  de limpieza enviados a root. Las pruebas/API del backend y revisión final
  siguen pendientes. Sin commit, push ni despliegue.


**Estado del MVP local:** entregable completo y revisado — 2026-10-27 18:28 MDT.
**Codificación:** GPT-6 Luna (`/root/luna_mvp`).
**Revisión:** Codex, coordinador (`/root`).
**Alcance:** versión local funcional; sin commit, push ni despliegue.
**Instrucciones:** [MVP_IMPLEMENTATION_BRIEF.md](MVP_IMPLEMENTATION_BRIEF.md).

Este archivo se actualiza en disco durante el trabajo. Mantenerlo abierto sin
editar permite ver las actualizaciones de Luna. Los estados son **Pendiente**,
**En curso**, **Implementado**, **En revisión**, **Verificado** o **Bloqueado**.
Una tarea implementada requiere revisión para pasar a Verificado.

| ID | Tarea y criterio de aceptación | Estado | Codificado por | Revisado por | Evidencia / archivos / último avance |
| --- | --- | --- | --- | --- | --- |
| M01 | Base React/TypeScript/Vite: instalación mínima, versiones fijadas, inicio y build reproducibles | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:04 MDT | Codex (/root) | Revisión independiente: `npm run build` y `npm test` (3/3) aprobados; versiones exactas y lockfile revisados. Flujo de navegador se verifica en M11. |
| M02 | Avisos iniciales y recuperación accesible desde cada pantalla | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:16 MDT | Codex (/root) | `src/main.tsx`, `scripts/browser-flow.mjs`; Chrome comprobó recuperación desde las tres pantallas, foco al cambiar y entrada manual de código. |
| M03 | Cohortes N-400, 56 jurisdicciones y distrito correcto; bancos completos 100/128 | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:16 MDT | Codex (/root) | `src/data/{jurisdictions,districts}.json`; prueba SQL real recorrió 441 distritos × 2 cohortes y 56 jurisdicciones; API/Chrome confirmaron bancos 100/128 y Samoa at-large. |
| M04 | Sesiones Supabase: esquema privado, código seguro, aislamiento y permisos revisables antes de aplicar | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:02 MDT | Codex (/root) | Migraciones remotas/locales `20261027200612` y `20261027200722`; prueba SQL independiente aprobada: roles anon/authenticated, dos sesiones aisladas, verificador oculto y permisos. Asesor de seguridad: 0 avisos. |
| M05 | Crear/guardar código, recuperar progreso y entrar directamente al hub | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:16 MDT | Codex (/root) | `src/lib/supabase.ts`, `src/main.tsx`; API y Chrome reales probaron creación, código de 256 bits, recuperación manual y progreso restaurado. |
| M06 | Hub y tarjetas de estudio con respuestas oficiales y progreso mínimo | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:16 MDT | Codex (/root) | Tarjetas y contador agregado en `src/main.tsx`; Chrome confirmó fuentes, fecha, revelado y deduplicación durante la sesión. |
| M07 | Cuestionario de autoevaluación funcional y puntuación acumulada | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:16 MDT | Codex (/root) | `src/main.tsx`, RPC `record_quiz_check`; un self-check por pregunta, 0/1 agregado, restaurado tras recarga; cubierto por SQL y Chrome. |
| M08 | Aviso por pregunta, fuentes, fecha real, burbuja de 5 segundos y vacantes correctas | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:16 MDT | Codex (/root) | Aviso/fuentes/fechas reales y fade de 5 s en `src/main.tsx`; “Vacante (anteriormente: …)” en `src/lib/domain.ts`; probado en Chrome y unit tests. |
| M09 | Caducidad a las 168 h, sin reactivación; eliminación automática comprobada | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:04 MDT | Codex (/root) | Prueba SQL independiente: códigos erróneos no refrescan, caducados no recuperan ni puntúan; limpieza elimina el registro de prueba. Job de limpieza activo `17 * * * *`; acceso caduca a 168 h, eliminación física en la siguiente limpieza horaria.  Ejecución horaria automática observada: succeeded, 2026-10-27 20:17 UTC. |
| M10 | Diseño moderno, móvil/tableta/escritorio, teclado/táctil y accesibilidad básica | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:16 MDT | Codex (/root) | `src/style.css`; Chrome headless con emulación táctil y viewports 320/390/820/1440px, sin overflow; captura segura del hub para móvil/escritorio. |
| M11 | Pruebas del flujo real, seguridad/privacidad, integridad de preguntas y escaneo de secretos | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:19 MDT | Codex (/root) | Revisión independiente: build + 4 pruebas unitarias, SQL de 441 distritos × 2 bancos y 56 jurisdicciones, Chrome completo, fuentes/fingerprints intactos, npm audit sin vulnerabilidades y snapshot publicable sin secretos. Ver MVP_REVIEW.md. |
| M12 | Instrucciones de uso y pruebas, servidor local disponible y límites documentados | Verificado | GPT-6 Luna (/root/luna_mvp), 2026-10-27 14:16 MDT | Codex (/root) | README revisado: arranque reproducible en puerto 4173, Chrome en terminal separada y .env.local existente preservado. Servidor reiniciado y comprobado por coordinador; límites de publicación documentados. |

## Registro de avances

- 2026-10-28 — GPT-6 Luna completó FC01–FC09 en frontend y documentación; FC10
  de backend escrito por GPT-6 Luna (/root/luna_flashcard_backend). Build,
  typecheck, 18 unit tests, English check, browser flow Chrome/Supabase y
  `git diff --check` pasaron. El navegador comprobó topic/count y rolling
  step/range synchronization, test táctil, respuestas correctas e incorrectas,
  timeout real de 15 segundos guardado como skipped en un test de una pregunta
  de la cohorte 2008, recuperación de progreso y Samoa at-large. Capturas
  seguras: `/tmp/npa-flashcards-notice.png`, `/tmp/npa-flashcards-settings.png`,
  `/tmp/npa-flashcards-card.png`, `/tmp/npa-flashcards-hub-phone.png` y
  `/tmp/npa-flashcards-hub-desktop.png`. Verifiers de las dos sesiones
  sintéticas se enviaron a Codex (/root) para limpieza exacta. Cambios locales
  sin commit/push/deploy; revisión y publicación corresponden al coordinador.

- 2026-10-27 20:04 MDT — GPT-6 Luna completó BR05 con el nombre aprobado
  Naturalization Preparation App (NPA) y el hostname
  `naturalization-preparation-app.vercel.app`, confirmado por el coordinador en
  el proyecto existente. Marca compacta accesible, notice, footer, metadata,
  pruebas y README/requisitos/briefs canónicos actualizados. Typecheck, build,
  `npm test` (4/4), English, Chrome smoke y full flow aprobaron. NPA aparece en
  320/390px; el nombre completo aparece en 820/1440px. Capturas seguras de aviso
  y hub compartidas para revisión; dos verifiers sintéticos enviados para
  limpieza dirigida. Sin publicación ni cambios en Supabase.

- 2026-10-27 19:35 MDT — GPT-6 Luna implementó BR01–BR04. `npm run typecheck`,
  `npm run build`, `npm test` (4/4), `npm run test:english`,
  `npm run test:browser` y `npm run test:browser-flow` aprobaron. Se guardaron
  capturas seguras del hub para móvil y escritorio; no se fotografió la pantalla
  del código. Dos sesiones sintéticas siguen pendientes de limpieza exacta por
  el coordinador. BR05 espera el nombre y slug elegidos por el propietario.

- 2026-10-27 14:02 MDT — Luna: creado esqueleto React/TypeScript/Vite con versiones
  exactas, catálogo local de 56 jurisdicciones/441 distritos, flujo inicial y
  borrador SQL privado enviado al coordinador.
- 2026-10-27 14:04 MDT — M01 implementado; typecheck/build/3 unit tests y diff
  check pasaron.
- 2026-10-27 14:16 MDT — M02/M03/M05-M08/M10 implementados; M04/M09 verificados
  por coordinador. Migraciones locales alineadas a versiones remotas
  20261027200612 y 20261027200722. SQL de todos los distritos y API/browser
  smoke pasaron; sesiones sintéticas identificadas se limpiaron después.
- 2026-10-27 14:19 MDT — README y documentación Supabase actualizados al estado real.
  Typecheck/build/4 unit tests/diff check y Gitleaks de archivos fuente pasan;
  el scan de directorio completo señala solo el publishable key en `.env.local`
  ignorado. Sesiones remotas: 0; servidor Vite disponible en puerto 4173.

- 2026-10-27 13:58 MDT — GPT-6 Luna inició M01. Leídos los documentos de
  alcance/requisitos, guía de datos y skills requeridos. No existía runtime de
  aplicación; se preservan todos los cambios de investigación sin commit.

## Bloqueos y decisiones

- Las preferencias mínimas de banco/estado/distrito se guardan con la sesión
  para que recuperar el código restaure el hub correcto; no se pide dirección
  ni fecha exacta del N-400.
- El cuestionario usa autoevaluación explícita tras revelar respuestas oficiales.
- El coordinador revisó el diseño antes de autorizar los cambios remotos y comprobó los permisos después de aplicarlos.
- La configuración/retención de logs y copias de proveedores se revisará antes
  de publicar. Esta entrega local no promete una auditoría de producción.

## Cierre de revisión

- 2026-10-27 18:28 MDT — Codex (/root): las 12 tareas quedan verificadas; implementación
  de aplicación, SQL y pruebas por GPT-6 Luna. Revisión independiente y límites
  en [MVP_REVIEW.md](MVP_REVIEW.md). No se añadió código de aplicación durante
  el cierre. La corrección documental de arranque de Luna quedó guardada.
- Se reinició el servidor local al retomar la tarea: http://127.0.0.1:4173/.
  No hubo commit, push ni despliegue.

- 2026-10-27 18:36 MDT — GPT-6 Luna completó EN01–EN03: app, errores,
  accesibilidad, metadatos y fechas en inglés; brief/requisitos/README/pruebas
  alineados; Vite estático con cabeceras Vercel. `npm run typecheck`,
  `npm run build`, `npm test` (4/4), `npm run test:english`,
  `npm run test:browser` y `npm run test:browser-flow` pasaron. Flujo real de
  ambos cohorts y anchuras 320/390/820/1440px; capturas seguras en
  `/tmp/civic-compass-hub-phone.png` y `/tmp/civic-compass-hub-desktop.png`.
  El flujo generó solo sesiones sintéticas; hashes de limpieza enviados al
  coordinador. Sin commit, push ni despliegue por Luna.
- 2026-10-27 18:38 MDT — Se añadió la nota visible de que proveedores pueden
  conservar logs técnicos de solicitud/seguridad. El flujo completo se repitió
  y pasó; Luna eliminó exclusivamente los dos verifiers sintéticos de esa
  ejecución y comprobó que ambos ya no existen.
- 2026-10-27 18:38 MDT — Confirmado en documentación oficial: `.vercelignore`
  filtra deploys de Vercel CLI; los deploys Git-linked usan Git como build input.
  En ambos casos, `outputDirectory: dist` limita el contenido estático servido.

## Publicación verificada

- 2026-10-27 18:47 MDT — [Civic Compass](https://citizenship-prep-sandy.vercel.app/) publicado
  en Vercel y GitHub; fuente inicial `8024438`. Código y configuración por Luna,
  revisión/publicación por coordinador. Pruebas reales en la URL pública pasaron;
  las dos sesiones sintéticas se eliminaron por hash exacto y se preservaron las demás.
- Ver [FIRST_PUBLICATION.md](FIRST_PUBLICATION.md) para pruebas, CI, cabeceras
  y límites de privacidad de infraestructura. Ya no hay tareas de publicación pendientes.

- 2026-10-27 20:07 MDT — Codex (/root): BR05 revisado y publicado. Commit fuente `cff4a5215c7b3f0bb9c2afbe93473132099b5988`; Vercel READY, URL NPA HTTP 200 anónimo, cabeceras y rutas privadas comprobadas. Chrome desde HTTPS público aprobó ambos cohorts, cuatro tamaños, recuperación, puntuación y aviso. Las dos sesiones sintéticas de esta ejecución se eliminaron por hashes exactos. Security CI 40618924116 aprobada.

- 2026-10-28 00:23 MDT — Codex (/root): publicación Study Flash Cards verificada en https://naturalization-preparation-app.vercel.app/. Fuente `6307dd1d18d001d4c1fd7db433874d7d9e18738f`; Vercel READY y Security CI40643360541 aprobada. Flujo público real pasó ambas ediciones, touch, conteos/rangos/rolling, resultados conocidos, timeout15s, recuperación y cuatro tamaños. Dos sesiones sintéticas eliminadas por hashes exactos; sesiones reales conservadas.
