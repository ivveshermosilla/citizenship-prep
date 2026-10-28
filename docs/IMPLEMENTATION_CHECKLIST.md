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

**Estado general:** BR01–BR04 revisados; BR05 implementado localmente tras selección explícita del propietario. Nombre/hostname confirmados y añadidos al proyecto Vercel existente por el coordinador; publicación del refresh aún pendiente.
**Codificado por:** GPT-6 Luna (`/root/luna_branding_refresh`).
**Revisado por:** Codex (/root), 2026-10-27 19:27 MDT; ver [BRANDING_REFRESH_REVIEW.md](BRANDING_REFRESH_REVIEW.md).
**Referencias visuales:** MatPro `ff0c2488e412db90ff2bac7db086acb102df12c5` y DivisionPro `257b32b37693fade5dc5dc92c3ce0668f6581ae2`; consultados CSS y HTML mediante GitHub.

| ID | Tarea y criterio de aceptación | Estado | Codificado por | Revisado por | Evidencia / archivos / último avance |
| --- | --- | --- | --- | --- | --- |
| BR01 | Restyle profesional, responsive y móvil primero, con fondos fríos, superficies blancas, jerarquía sans, controles accesibles y foco visible | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | `src/style.css`; revisión en Chrome a 320/390/820/1440px, sin overflow. Capturas seguras de hub móvil y escritorio listas para el coordinador. La comprobación del nombre largo final corresponde a BR05. |
| BR02 | Tagline solicitado y terminología visible Question Edition con opciones 2008/2025; mantener idioma, fechas y mecánicas existentes | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | `src/main.tsx`, `index.html`, `scripts/check-english-copy.mjs`; check English, build, typecheck y 4 unit tests aprobados; el texto visible no contiene “bank”. |
| BR03 | Mapa estadounidense reconocible con estrellas y franjas, cargado localmente y con licencia/procedencia verificable | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | `public/us-map-flag.svg`; geometría de 50 estados adaptada de [Wikimedia Commons: Blank US Map (states only).svg](https://commons.wikimedia.org/wiki/File:Blank_US_Map.svg), atribuida a Heitordp, CC0 1.0 ([licencia](https://creativecommons.org/publicdomain/zero/1.0/)); favicon SVG enlazado en `index.html`. SVG local sin contenido activo ni referencias externas; aspecto comprobado en captura móvil/escritorio. |
| BR04 | Preservar avisos, fuentes, sesión anónima, reanudación, caducidad a 168 h, tarjetas y autoevaluación; compartir capturas seguras para revisión | Verificado | GPT-6 Luna (/root/luna_branding_refresh) | Codex (/root) | `npm run test:browser` y `npm run test:browser-flow` aprobados: avisos, recuperación y score, fuentes/fechas, tarjetas, quiz, burbuja de 5 s, dos ediciones y viewports 320/390/820/1440px. Coordinador inspeccionó capturas seguras de hub y avisos. Eliminadas exactamente dos sesiones sintéticas por hash; consulta posterior confirmó cero coincidencias. |
| BR05 | Aplicar Naturalization Preparation App (NPA) en marca, accesibilidad, metadatos, documentos y pruebas; comprobar nombre completo y NPA en dispositivos apropiados | Implementado | GPT-6 Luna (/root/luna_branding_refresh) | Pendiente | Nombre/hostname seleccionados por el propietario; coordinador confirmó `naturalization-preparation-app.vercel.app` verificado en el proyecto existente. App/docs canónicos actualizados; checks finales aprobaron, incluidos NPA a 320/390 y nombre completo a 820/1440. No se alteró Supabase ni se publicó. |

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
