import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const surfaces = ['src/main.tsx', 'src/lib/domain.ts', 'src/lib/supabase.ts', 'index.html']
const source = surfaces.map(path => [path, readFileSync(path, 'utf8')])
const html = readFileSync('index.html', 'utf8')
assert.match(html, /<html lang="en">/u, 'document language must be English')
assert.match(html, /<title>Civic Compass · Naturalization Practice<\/title>/u, 'English product title must be present')
assert.match(html, /name="description" content="Anonymous practice for U\.S\. naturalization civics questions\."/u)
const ui = source.map(([, content]) => content).join('\n')
assert.match(ui, /Civic Compass/u)
assert.match(ui, /IMPORTANT NOTICE FOR THIS QUESTION/u)
assert.match(ui, /Hosting and database providers may retain technical request\/security logs under their own policies\./u)
assert.match(ui, /Vacant \(previously:/u)
assert.match(ui, /toLocaleDateString\('en-US'/u)
assert.match(ui, /toLocaleString\('en-US'/u)
assert.doesNotMatch(ui, /[áéíóúñÁÉÍÓÚÑ¿¡]/u, 'user-facing surfaces must not contain Spanish punctuation or accented characters')
assert.doesNotMatch(ui, /\b(?:sesión|Continuar|preguntas|respuestas|Vacante|AVISO IMPORTANTE)\b/iu, 'common Spanish UI text must not return')
console.log(`English UI check passed for ${surfaces.join(', ')}`)
