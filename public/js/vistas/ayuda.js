export async function mostrar(raiz, _p, sesion) {
  const staff = sesion.rol !== 'experto';
  raiz.innerHTML = `<div><h1>Guía de uso</h1><p class="lead">Cómo se usa el Estimador de Software de principio a fin.</p></div>
  <section class="card"><h2>Roles</h2><ul>
    <li><b>Administrador:</b> registra usuarios (moderadores y expertos) y configura los métodos.</li>
    <li><b>Moderador:</b> define proyectos, aplica un método, elige a los expertos y conduce las rondas.</li>
    <li><b>Experto:</b> entra con su usuario, ve las estimaciones en las que fue incluido y registra sus valores.</li></ul>
    <p class="note">Todos los usuarios pueden cambiar su propia clave en <b>Mi cuenta</b> (botón en la parte superior): se escribe la clave actual, la nueva y se repite la nueva.</p></section>
  <section class="card"><h2>Flujo de trabajo</h2><ol>
    <li><b>Definir el proyecto</b> (Proyectos → Nuevo proyecto): nombre, cliente, fecha requerida por el cliente y definición del problema.</li>
    <li><b>Completar la definición</b> en la pantalla del proyecto: módulos, requisitos («El sistema permitirá…») y actividades a estimar.</li>
    <li><b>Estimar</b> (menú Estimar): elegir un proyecto registrado, el método (Tres Puntos o Wideband Delphi), parámetros de equipo y plazo, y los expertos participantes. Un mismo proyecto puede estimarse las veces que quieras con cualquiera de los dos métodos; el historial queda guardado.</li>
    <li><b>Iniciar la estimación:</b> se abre la ronda 1 y los expertos registran sus valores.</li>
    <li><b>Tres Puntos:</b> cada experto da O, M y P por actividad. Al cerrar la ronda se promedian los valores de los expertos y se calcula E = (O + 4M + P) / 6 y σ = (P − O) / 6.</li>
    <li><b>Wideband Delphi:</b> cada experto da un valor por actividad sin ver los de los demás. El moderador cierra la ronda, revisa la dispersión = (máx − mín) / mediana × 100 y abre otra ronda o finaliza con el promedio.</li>
    <li><b>Resultados:</b> esfuerzo, σ total (√Σσ²), rangos de confianza, escenarios de plazo y costo, gráficos y exportación CSV.</li></ol></section>
  ${staff ? '' : '<section class="card"><h2>Si eres experto</h2><p>Abre la estimación pendiente, revisa la definición del proyecto, escribe tus valores y pulsa <b>Enviar valores</b>. Puedes guardar un borrador y terminar después.</p></section>'}`;
}
