// Aplica el tema antes de dibujar la página, para que no parpadee. Va en un archivo
// aparte porque la política de seguridad de la app no permite scripts en el HTML.
try {
  var tema = localStorage.getItem('casa.tema');
  if (tema === 'oscuro' || (!tema && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {
  // Sin almacenamiento, queda el tema claro.
}
