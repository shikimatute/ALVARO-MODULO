export {};
/*const dinamicInstructions = `
1. Indica cuál(es) de estas partidas deseas evaluar en la imagen (ej. CERÁMICA PISOS, RED DE GAS INTERIOR, etc.).

2. Para cada partida, asigna un porcentaje de avance en cualquier punto entre 0 y 100:
   • 0% si no se ve instalado/completado o no se aprecia en la imagen (y no hay partida posterior que lo implique como terminado).
   • 90% si está prácticamente listo, pero no puedes confirmar la totalidad de la partida. Dejarás este 10% pendiente hasta que un administrador confirme.
   • 100% si el elemento está completamente instalado/completado, o si en la imagen hay evidencia de una partida posterior que requiere su finalización.
   • Si la partida incluye varios subítems (por ej., “cerraduras_interiores_y_topes”), evalúa cada uno por separado y luego calcula el promedio.

3. Incluye siempre un campo “observaciones” que describa brevemente lo que se ve (o no se ve) en la imagen y justifique el porcentaje asignado.

4. Opcionalmente, concluye con un campo "conclusion" si deseas un resumen general.
`;

const dinamicRules = `•	Regla de Suposición sobre Partidas Posteriores
Si la imagen evidencia que una partida posterior está finalizada y depende de una partida anterior, se supone que la partida anterior está completada.
    •	Ejemplo: Cerámica instalada y fraguada implica la impermeabilización previa al 100%.
    •	No Añadir Información Extra
    •	El porcentaje de avance se basa únicamente en la imagen y la partida consultada.
    •	No añadas datos de otras partes de la imagen que no sean relevantes a la pregunta.
    •	Análisis Exclusivo con Base en Foto + Pregunta
    •	Determina la calificación (porcentaje) exclusivamente con la foto y la pregunta.
    •	No agregues más información si el prompt no lo solicita. `;

const conclusion = ` EN CONCLUSION:
  1.  Observa la imagen.
  2.  Evalúa el porcentaje de avance (0%, 90%, 100%, u otro valor intermedio si son varios subítems).
  3.  Regla de Suposición: si una partida posterior depende de esta y está instalada, asume la partida previa al 100%.
  4.  90%: si no puedes confirmar totalmente que esté al 100%, deja un 10% pendiente hasta la confirmación del administrador.
  5.  Observaciones: describe brevemente la razón de tu calificación, sin información adicional no solicitada.
Criterios de Evaluación
  • 0%: No instalado o no visto en la imagen.
  • 90%: Prácticamente listo, pero sin confirmación absoluta.
  • 100%: Completo o deducido por la Regla de Suposición.
  • Valores intermedios: si varios subítems tienen estados diferentes (ej. 50% si uno está a 100% y otro a 0%).
`;
 */
