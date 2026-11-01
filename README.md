# Cuentas de la casa

App web instalable (PWA) para registrar, ver y editar los ingresos y gastos de la casa, desde el teléfono o el computador. Reemplaza a un Excel de control: replica sus cálculos y agrega carga rápida, filtros, gráficos y presupuestos.

## Privacidad

- **Sin servidor:** el Excel se lee en tu dispositivo, y los datos quedan en el almacenamiento de tu navegador (IndexedDB). No hay base de datos remota, cuentas ni analítica.
- **Sin conexiones externas:** el sitio publicado declara una política de seguridad (`connect-src 'self'`) que impide enviar datos a otros servidores, y un test revisa que el código no haga llamadas de red.
- **Nada en el repositorio:** este repositorio es público y solo tiene código. Los Excel y la carpeta `datos/` están en `.gitignore`, y los tests usan datos inventados.

## Importante: tus datos están en cada dispositivo

**No hay sincronización.** El teléfono y el computador tienen cada uno su propia copia, independiente de la otra. Lo más simple es elegir un dispositivo principal, y anotar ahí.

Para pasar los datos a otro dispositivo: en **Datos → Respaldos**, usa **Descargar respaldo** en uno, y **Restaurar desde un archivo descargado** en el otro. Restaurar reemplaza todo lo que había en ese dispositivo.

**Descarga un respaldo seguido** y guárdalo fuera del dispositivo, en Drive, tu correo o un pendrive. Si borras los datos del navegador, desinstalas la app o pierdes el teléfono, ese archivo es lo único que queda. La app te lo recuerda si pasan 14 días sin descargar uno.

## Instalar en el teléfono

**iPhone (Safari):** abre el link de la app → botón Compartir → **Agregar a inicio**. Después abre la app **desde el ícono** y carga ahí tus datos.

> En iPhone, Safari y la app instalada guardan los datos por separado. Si el Excel te llegó por WhatsApp o correo, guárdalo primero en Archivos.

**Android (Chrome):** abre el link → menú ⋮ → **Instalar app**.

Después de la primera carga, funciona sin conexión.

## Primer uso

Al abrir la app por primera vez, elige tu Excel en **Importar Excel**. Verás una vista previa, y solo se guarda al confirmar. La primera importación deja **febrero de 2026 excluido del promedio**, porque está incompleto; se puede volver a incluir en **Año**.

Reimportar es seguro:

- No duplica movimientos, ni siquiera los que son legítimamente idénticos.
- No pisa lo que se haya editado en la app.
- No revive lo que se haya borrado en la app.
- Agrega solo las filas nuevas del Excel.
- Una categoría fusionada no se recrea: sus movimientos caen en la categoría de destino.

Una fila ya importada que se corrija **en el Excel** cuenta como fila nueva, porque cambia su identificación. Después de importar, conviene hacer las correcciones en la app.

## Exportar

En **Datos → Exportar**:

- **Excel:** hojas Movimientos y Categorías con la misma estructura del original, listas para elegir categoría y cuenta, y filas amarillas por revisar. No incluye las hojas de resumen. La hoja Categorías suma una columna, «Función (no cambiar)»: conserva las categorías especiales si importas el archivo en otro dispositivo.
- **CSV:** todos los movimientos, separados por punto y coma, para abrir en Excel en español.

## Copias dentro del navegador

Además del archivo descargado, la app guarda copias en el mismo navegador, para poder volver atrás: una al día y otra antes de importar, fusionar o restaurar. Se conservan las últimas 14 de cada tipo. Están en el mismo lugar que los datos, así que **no reemplazan al archivo descargado**.

## Para desarrollar

Requiere [Node.js](https://nodejs.org) (probado con la versión 24).

```bash
npm install
```

```bash
npm run dev
```

Comprobar que todo calza:

```bash
npm test
```

```bash
npm run build
```

`tests/aceptacion.test.ts` importa el Excel real y compara lo que calcula la app con los valores que el Excel dejó calculados, al peso. Busca el archivo en `datos/Control_de_ingresos_y_gastos_conciliado.xlsx`; sin él, esos tests se saltan, como pasa en GitHub.

Publicar: cada `push` a `main` corre los tests y publica en GitHub Pages con `.github/workflows/deploy.yml`.

### Estructura

| Carpeta | Contenido |
|---|---|
| `src/lib/` | Lógica pura, con sus tests: cálculos, operaciones sobre los datos, importación, Excel y respaldos |
| `src/ui/` | Pantallas en React, y el almacenamiento en IndexedDB (`almacen.ts`) |
| `tests/` | Tests. Generan sus propios datos inventados |
| `datos/` | Solo en tu computador: Git la ignora |

### Decisiones

- **Sin Excel en los tests públicos:** ningún monto real queda escrito en el código; la prueba de aceptación los lee del archivo.
- **`rol` en las categorías:** marca las especiales (traspaso desde y hacia, pago de tarjetas, giros de efectivo). Así, renombrarlas no rompe el traído neto ni los recordatorios de doble conteo. No cambian de tipo, no se fusionan en otra ni se borran.
- **Fusionar:** solo categorías del mismo tipo, porque entre tipos distintos cambiarían los totales. El destino hereda el presupuesto si no tiene. Las cuentas no se fusionan: se archivan, y se borran si no tienen movimientos.
- **Borrado suave:** permite «Deshacer» y evita que reimportar reviva lo borrado.
- **Meses excluidos:** un mes excluido no se reemplaza por uno más antiguo; el promedio usa menos meses. Incluir un mes solo deshace una exclusión manual.
- **Mes que entra al promedio con pocos datos:** al anotar el primer movimiento de un mes nuevo, si el mes anterior tiene 7 o más días finales sin datos, la app avisa y ofrece excluirlo.
- **Barra de presupuesto:** verde bajo el 80 %, ámbar desde el 80 % hasta el 100 % y roja solo al pasarse. Siempre lleva texto, no solo color.
- **Gráfico de tendencia:** hasta 8 categorías a la vez. Parte con las 6 de mayor gasto del año, y cada categoría conserva su color al agregar o quitar otras. Los colores se validaron para daltonismo en modo claro y oscuro.
- **Otra pestaña:** si la app está abierta en dos pestañas, cada guardado revisa que nadie haya escrito entre medio, y la otra se actualiza sola.
