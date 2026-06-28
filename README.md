# Evaluación de Perfil Integral — Google Apps Script Web App

Aplicación web (100% HTML + Google Apps Script) que administra un test interactivo
de **rasgos de personalidad, cognitivos, intelectuales y emocionales**, guarda los
resultados en un **Google Sheets vinculado** y genera un **informe extenso y
personalizado** al finalizar.

## Marcos teóricos implementados

| Área | Marco | Dónde |
|---|---|---|
| Personalidad | **Big Five / OCEAN** + **HEXACO** (Ashton & Lee), ítems **IPIP** | `Items.gs`, `Scoring.gs` |
| Formato de medida | **Likert** vs. **Elección Forzada (ipsativa)** | `Items.gs` (`FORCED_CHOICE_BLOCKS`), `Scoring.gs` |
| Cognición | **Teoría CHC** (Cattell-Horn-Carroll): **Gf** (fluida) y **Gc** (cristalizada) | `Items.gs`, `Scoring.gs` |
| Puntuación cognitiva | **TRI / IRT** (modelo logístico 2PL) con estimación **EAP** de θ | `Scoring.gs` (`eapTheta_`) |
| Emoción (rasgo) | **TEIQue** (Petrides): Bienestar, Autocontrol, Emocionalidad, Sociabilidad | `Items.gs`, `Scoring.gs` |
| Emoción (habilidad) | **MSCEIT** (Mayer-Salovey-Caruso): juicio situacional con clave de consenso | `Items.gs`, `Scoring.gs` |
| Inferencia indirecta | **Evaluación Sigilosa** (Valerie Shute): rasgos inferidos de decisiones y tiempos | `Items.gs` (`STEALTH_ITEMS`), `Scoring.gs` |

## Estructura de archivos

```
appsscript.json   Manifiesto (web app + scopes de Sheets)
Code.gs           doGet, envío, gestión del Spreadsheet y escritura de hojas
Items.gs          Banco de ítems (todos los marcos)
Scoring.gs        Motor de puntuación (Likert, ipsativo, IRT-EAP, EI, stealth)
Report.gs         Generación del informe extenso y personalizado
Index.html        Página principal
Styles.html       Estilos (parcial incluido)
Client.html       Lógica del cliente / wizard (parcial incluido)
```

## Despliegue paso a paso

1. Crea un proyecto en [script.google.com](https://script.google.com) (o un
   Apps Script **vinculado** a una hoja de cálculo desde *Extensiones → Apps Script*).
2. Copia cada archivo de este repo a un archivo del mismo nombre en el editor:
   - Los `.gs` como archivos de **Script**.
   - Los `.html` como archivos **HTML** (`Index`, `Styles`, `Client`).
   - Pega el contenido de `appsscript.json` en el manifiesto (activa *Mostrar
     manifiesto* en Configuración del proyecto si no lo ves).
3. Ejecuta la función **`setup`** una vez desde el editor para autorizar permisos
   y crear la estructura de hojas. Verás la URL del Spreadsheet de resultados en
   los registros (`Ver → Registros`).
4. **Implementar → Nueva implementación → Aplicación web**:
   - *Ejecutar como*: Yo.
   - *Quién tiene acceso*: Cualquiera (o lo que necesites).
5. Abre la URL de la app web y realiza el test.

### Vinculación con Google Sheets

- Si el script está **vinculado** a una hoja, se usa esa hoja automáticamente
  (`SpreadsheetApp.getActiveSpreadsheet()`).
- Si es un script **independiente**, se crea un Spreadsheet la primera vez y su ID
  se guarda en las *Propiedades del script* (`ASSESSMENT_SPREADSHEET_ID`), de modo
  que siempre escribe en la misma hoja.

La función `ensureStructure_` es **idempotente**: crea las hojas y encabezados solo
si faltan; si ya existen, únicamente agrega filas.

### Hojas generadas

- **Resumen**: una fila por participante (percentiles HEXACO, CI Gf/Gc/g, IE, etc.).
- **Escalas**: formato largo, una fila por escala puntuada.
- **Items**: formato largo, respuesta cruda + tiempo de respuesta + acierto.
- **Metadatos**: información del instrumento.

## Verificación rápida

Ejecuta `selfTest_()` en el editor para puntuar un envío sintético y registrar el
resumen sin pasar por la interfaz.

## Rigor y limitaciones

- La **lógica psicométrica** es real: recodificación de ítems inversos, puntuación
  ipsativa, estimación de habilidad por IRT-EAP (2PL) con prior N(0,1), crédito
  parcial por consenso (MSCEIT) y conversión a percentiles/CI.
- Los **baremos** (`NORMS`) y los **parámetros IRT** (`a`, `b`) son **ilustrativos**.
  Para uso aplicado real deben **calibrarse con una muestra normativa** (las hojas
  `Items`/`Escalas` están pensadas para alimentar ese proceso).
- No es un instrumento clínico ni de selección. Es una herramienta de
  autoconocimiento y una base técnica sólida sobre la que iterar.

## Próximos pasos sugeridos

- Ampliar el banco de ítems por faceta (subdominios HEXACO, narrow abilities CHC).
- Refinar el diseño visual (esta versión prioriza la lógica).
- Recalibrar parámetros con datos reales y añadir control de exposición de ítems.
