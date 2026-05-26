# QuickSort con cartas (`Media_cromo`)

Demo en **HTML/CSS/JS**: cartas = imágenes PNG en `Media_cromo`, valor extraído del nombre del archivo.

## Valor en el nombre

Patrón: número después de `_p` y antes de la extensión.

- `Cromo_jug1_p67.png` → **67**
- `Cromo_jug2_p84.png` → **84**

La lógica está en `mediaCards.js` (`parseCardValueFromFilename`).

## Lista de archivos

El navegador no puede “listar una carpeta” solo. Se usa `Media_cromo/manifest.json` con el array `files`. Si falla la carga, se usa la lista por defecto en `mediaCards.js` (`DEFAULT_MEDIA_CROMO_FILES`).

**Añadir una carta nueva:** copia el PNG en `Media_cromo` y agrega el nombre en `manifest.json`.

## Cómo ejecutar

```bash
cd /home/ferchito/Documentos/UFPS/Analisis_Algoritmos/quick_sort_algoritmo
python3 -m http.server 8000
```

Abre `http://localhost:8000`.

## Controles

1. Al cargar, las cartas aparecen **en fila** (orden jugador 1, 2, … según el nombre).
2. **Revolver** — baraja el orden actual.
3. **QuickSort** — animación automática (velocidad con el deslizador).
4. **Paso a paso** — cada clic avanza un paso del algoritmo.

El algoritmo emisor de eventos está en `quicksortCards.js` (sin DOM).
